import { randomBytes } from 'node:crypto';
import { loadEnv } from '../env.js';
import { query, withTx } from '../lib/db.js';
import { insertEvent } from '../lib/event-log.js';
import { log } from '../lib/logger.js';
import { PlabApiClient, createPlabClient } from '../lib/plab-api-client.js';
import { createSlackClient, type SlackClient } from '../lib/slack-client.js';
import { makeToken } from '../lib/token.js';
import {
  formatKstDisplay,
  formatKstSqlDateTime,
  formatUtcSqlDateTime,
  parseDbSchedule,
  parseKstSqlDateTime,
  threeHoursLaterTopOfHour,
  tokenExpiryFromSchedule,
} from '../lib/time.js';
import type { CurrentMatch, RecommendedMatch } from '../types/api.js';

export interface ExtractContext {
  plab: PlabApiClient;
  slack: SlackClient;
  hmacSecret: string;
  publicBaseUrl: string;
  now?: Date;
  /** 지정 시 now+3h 대신 이 시각(KST 'YYYY-MM-DD HH:00:00')으로 추출 (수동 테스트용). */
  targetSchedule?: string;
  /** 지정 시 DB test_config 대신 임시 기준값 사용 (수동 테스트용). */
  lowThreshold?: number;
  highThreshold?: number;
  /** true면 DB 저장·슬랙 발송 없이 추출 결과만 미리보기. */
  dryRun?: boolean;
}

export interface ExtractPreviewItem {
  managerName: string | null;
  current: CurrentMatch;
  recommendedCount: number;
}

// 발송 분리(ADR-012→ADR-013): 추출 단계는 메시지를 발송하지 않고
// targets에 notification_status='pending'으로 누적만 한다.
// 실제 발송은 운영자가 발송 관리 화면(/admin/export)에서 채널톡 복붙으로 처리.
export interface ExtractSummary {
  targetSchedule: string;
  lowThreshold: number;
  highThreshold: number;
  dryRun: boolean;
  rawCandidates: number;
  afterDedup: number;
  afterRecommendationFilter: number;
  inserted: number;
  /** dryRun일 때만 채워지는 대상 미리보기. */
  preview: ExtractPreviewItem[];
}

interface ConfigRow {
  low_threshold: number;
  high_threshold: number;
}

async function loadActiveConfig(): Promise<ConfigRow> {
  const res = await query<ConfigRow>(
    `SELECT low_threshold, high_threshold FROM test_config ORDER BY id DESC LIMIT 1`,
  );
  const row = res.rows[0];
  if (!row) throw new Error('test_config is empty — run migrations / seed first');
  return row;
}

export async function runExtractTargets(ctxOverride: Partial<ExtractContext> = {}): Promise<ExtractSummary> {
  const env = loadEnv();
  const ctx: ExtractContext = {
    plab: ctxOverride.plab ?? createPlabClient(env),
    slack: ctxOverride.slack ?? createSlackClient(env),
    hmacSecret: ctxOverride.hmacSecret ?? env.HMAC_SECRET,
    publicBaseUrl: ctxOverride.publicBaseUrl ?? env.PUBLIC_BASE_URL,
    now: ctxOverride.now,
    targetSchedule: ctxOverride.targetSchedule,
    lowThreshold: ctxOverride.lowThreshold,
    highThreshold: ctxOverride.highThreshold,
    dryRun: ctxOverride.dryRun,
  };

  const now = ctx.now ?? new Date();
  // 매치 시각: 수동 입력(ctx.targetSchedule)은 KST로 해석, 자동은 now+3h.
  const targetDate = ctx.targetSchedule
    ? parseKstSqlDateTime(ctx.targetSchedule)
    : threeHoursLaterTopOfHour(now);
  // PLAB DB는 schedule을 UTC로 저장 → 비교는 UTC 문자열, 표시는 KST.
  const targetScheduleUtc = formatUtcSqlDateTime(targetDate);
  const targetScheduleKst = formatKstSqlDateTime(targetDate);
  const dryRun = ctx.dryRun ?? false;

  const cfg: ConfigRow =
    ctx.lowThreshold != null && ctx.highThreshold != null
      ? { low_threshold: ctx.lowThreshold, high_threshold: ctx.highThreshold }
      : await loadActiveConfig();

  const summary: ExtractSummary = {
    targetSchedule: targetScheduleKst,
    lowThreshold: cfg.low_threshold,
    highThreshold: cfg.high_threshold,
    dryRun,
    rawCandidates: 0,
    afterDedup: 0,
    afterRecommendationFilter: 0,
    inserted: 0,
    preview: [],
  };

  log.info('extract-targets start', {
    targetScheduleKst,
    targetScheduleUtc,
    dryRun,
  });
  const q1Rows = await ctx.plab.q1ExtractTargetMatches({
    targetSchedule: targetScheduleUtc,
    lowThreshold: cfg.low_threshold,
  });
  summary.rawCandidates = q1Rows.length;

  // Dedup: skip if (manager_id, current_match_id) already exists.
  const dedup: typeof q1Rows = [];
  for (const c of q1Rows) {
    const dup = await query(
      `SELECT 1 FROM targets WHERE manager_id = $1 AND current_match_id = $2 LIMIT 1`,
      [c.manager_id, c.match_id],
    );
    if (!dup.rowCount) dedup.push(c);
  }
  summary.afterDedup = dedup.length;

  for (const candidate of dedup) {
    let q2Rows: Awaited<ReturnType<PlabApiClient['q2FindRecommendations']>> = [];
    try {
      q2Rows = await ctx.plab.q2FindRecommendations({
        targetSchedule: targetScheduleUtc,
        areaId: candidate.area_id,
        highThreshold: cfg.high_threshold,
      });
    } catch (err) {
      log.error('q2 failed', { match_id: candidate.match_id, err: errMsg(err) });
      continue;
    }
    if (q2Rows.length === 0) {
      log.info('skip: no recommendations', { match_id: candidate.match_id });
      continue;
    }
    summary.afterRecommendationFilter += 1;

    // Build payloads
    const currentMatchInfo: CurrentMatch = {
      matchId: candidate.match_id,
      scheduleKst: formatKstDisplay(parseDbSchedule(candidate.schedule)),
      stadiumName: candidate.stadium_name,
      fieldName: candidate.field_name,
      participantCount: Number(candidate.participant_count),
      areaId: candidate.area_id,
      areaName: candidate.area_name,
      grade: candidate.grade,
    };
    const recommended: RecommendedMatch[] = q2Rows.slice(0, 5).map((r) => ({
      matchId: r.match_id,
      scheduleKst: formatKstDisplay(parseDbSchedule(r.schedule)),
      stadiumName: r.stadium_name,
      fieldName: r.field_name,
      participantCount: Number(r.participant_count),
      isTransferOrigin: r.manager_return === 1,
      isPromotion: r.test_type !== null && [3, 6, 7, 8, 9].includes(r.test_type),
      grade: r.grade,
    }));

    // dry-run: 저장·발송 없이 미리보기만 수집하고 다음 후보로.
    if (dryRun) {
      summary.preview.push({
        managerName: candidate.manager_name,
        current: currentMatchInfo,
        recommendedCount: recommended.length,
      });
      continue;
    }

    // Token (will be regenerated after we know the targets.id)
    const tokenExpiry = tokenExpiryFromSchedule(parseDbSchedule(candidate.schedule));
    // Use a placeholder token first; replace post-insert.
    const tempToken = randomBytes(16).toString('hex');

    let insertedTargetId: number | null = null;
    try {
      insertedTargetId = await withTx(async (client) => {
        const ins = await client.query<{ id: number }>(
          `INSERT INTO targets (manager_id, manager_name, current_match_id, current_match_info, recommended_matches, token, token_expires_at)
           VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
           ON CONFLICT ON CONSTRAINT uniq_manager_match DO NOTHING
           RETURNING id`,
          [
            candidate.manager_id,
            candidate.manager_name,
            candidate.match_id,
            JSON.stringify(currentMatchInfo),
            JSON.stringify(recommended),
            tempToken,
            tokenExpiry.toISOString(),
          ],
        );
        const row = ins.rows[0];
        if (!row) return null;
        // Now compute the real HMAC token referencing the row id.
        // BIGSERIAL id는 pg가 문자열로 반환 → 토큰 payload의 tid(number)로 정규화 (verifyToken 호환).
        const realToken = makeToken(
          { tid: Number(row.id), exp: tokenExpiry.toISOString() },
          ctx.hmacSecret,
        );
        await client.query(`UPDATE targets SET token = $1 WHERE id = $2`, [realToken, row.id]);
        return row.id;
      });
    } catch (err) {
      log.error('target insert failed', { match_id: candidate.match_id, err: errMsg(err) });
      continue;
    }

    if (insertedTargetId === null) {
      log.info('target dedup conflict (race)', { match_id: candidate.match_id });
      continue;
    }
    summary.inserted += 1;
    await insertEvent({
      targetId: insertedTargetId,
      eventType: 'extracted',
      metadata: {
        match_id: candidate.match_id,
        recommended_count: recommended.length,
        area_id: candidate.area_id,
        area_name: candidate.area_name,
        // 등급 통계용: 현재 매치 등급(NULL=미분류) + 추천 매치 등급 배열.
        // 구버전 extracted 이벤트엔 없을 수 있어 stats 조회 시 graceful 처리한다.
        current_grade: candidate.grade,
        recommended_grades: recommended.map((r) => r.grade ?? null),
      },
    });
    // 자동 발송 없음 (ADR-013). notification_status='pending'(DEFAULT)으로 누적되어
    // 운영자가 발송 관리 화면에서 대상자별 메시지를 복사해 채널톡으로 발송한다.
  }

  log.info('extract-targets done', summary as unknown as Record<string, unknown>);

  // dry-run이 아니면 추출 결과를 항상 슬랙에 전송 (0건도 결과로 보고).
  if (!dryRun) {
    try {
      await ctx.slack.postExtractSummary({
        targetSchedule: summary.targetSchedule,
        inserted: summary.inserted,
        rawCandidates: summary.rawCandidates,
        afterRecommendationFilter: summary.afterRecommendationFilter,
        exportUrl: `${ctx.publicBaseUrl.replace(/\/$/, '')}/admin/export`,
      });
    } catch (err) {
      log.error('slack extract-summary failed', { err: errMsg(err) });
    }
  }

  return summary;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
