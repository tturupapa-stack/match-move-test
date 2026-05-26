import { Router } from 'express';
import { z } from 'zod';
import { loadEnv } from '../../env.js';
import { query } from '../../lib/db.js';
import { insertEvent } from '../../lib/event-log.js';
import { buildMessageBody } from '../../lib/message-builder.js';
import { createPlabClient } from '../../lib/plab-api-client.js';
import { log } from '../../lib/logger.js';
import type {
  ApiOk,
  CurrentMatch,
  EventType,
  ExportHistoryItem,
  ExportHistoryReport,
  RecommendedMatch,
} from '../../types/api.js';

export const adminExportRouter: Router = Router();

interface PendingTargetRow {
  id: number;
  manager_id: number;
  manager_name: string | null;
  current_match_info: CurrentMatch; // jsonb → parsed object
  recommended_matches: RecommendedMatch[]; // jsonb (관리자 전용: 양도/프로모션 포함)
  token: string;
  export_count: number;
}

function buttonUrlFor(publicBaseUrl: string, token: string): string {
  return `${publicBaseUrl.replace(/\/$/, '')}/match-move?t=${encodeURIComponent(token)}`;
}

function digitsOnly(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

export interface PendingMessageItem {
  targetId: number;
  managerName: string | null;
  phone: string; // 숫자만 (식별용). PLAB 조회 실패 시 빈 문자열.
  matchTime: string | null;
  stadiumName: string | null;
  fieldName: string | null; // 현재 매치 면 (구버전 대상은 null)
  currentGrade: number | null; // 현재 매치 등급 (CurrentMatch.grade — 구버전 대상은 null)
  exportCount: number;
  messageText: string; // 채널톡에 그대로 붙여넣을 본문 (메시지 + 추천 페이지 URL)
  recommended: RecommendedMatch[]; // 관리자 전용: 추천받은 매치 + 양도/프로모션 여부
}

/**
 * GET /api/admin/export/pending — 발송 대기 대상 + 채널톡 복붙용 메시지.
 * 대상자가 적은 운영(ADR-013)을 가정해 1:1 복붙 형식으로 제공한다.
 * phone은 PLAB에서 조회만 하고 자체 DB에 저장하지 않는다 (PRD §5.2). 조회 실패해도 목록은 반환.
 */
adminExportRouter.get('/export/pending', async (_req, res) => {
  const env = loadEnv();
  const tr = await query<PendingTargetRow>(
    `SELECT id, manager_id, manager_name, current_match_info, recommended_matches, token, export_count
       FROM targets
      WHERE notification_status = 'pending'
      ORDER BY id ASC`,
  );

  let phoneMap = new Map<number, string>();
  if (tr.rows.length > 0) {
    const managerIds = [...new Set(tr.rows.map((t) => t.manager_id))];
    try {
      const phones = await createPlabClient(env).qManagerPhones(managerIds);
      phoneMap = new Map(phones.map((p) => [p.id, p.phone]));
    } catch (err) {
      log.error('pending: manager phone lookup failed (best-effort)', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const items: PendingMessageItem[] = tr.rows.map((t) => {
    const cm = t.current_match_info;
    const url = buttonUrlFor(env.PUBLIC_BASE_URL, t.token);
    const body = buildMessageBody({
      managerName: t.manager_name ?? '',
      matchTime: cm.scheduleKst,
      stadiumName: cm.stadiumName,
      fieldName: cm.fieldName,
      participantCount: cm.participantCount,
    });
    const rawPhone = phoneMap.get(t.manager_id) ?? '';
    return {
      targetId: Number(t.id),
      managerName: t.manager_name,
      phone: rawPhone ? digitsOnly(rawPhone) : '',
      matchTime: cm.scheduleKst,
      stadiumName: cm.stadiumName,
      fieldName: cm.fieldName ?? null,
      currentGrade: cm.grade ?? null,
      exportCount: t.export_count,
      messageText: `${body}\n\n▶ 추천 매치 보기: ${url}`,
      recommended: t.recommended_matches ?? [],
    };
  });

  res.json({ ok: true, data: { count: items.length, items } } satisfies ApiOk<{
    count: number;
    items: PendingMessageItem[];
  }>);
});

const markSchema = z.object({
  // 클라이언트가 문자열 id를 보내도 허용 (BIGSERIAL이 JSON에서 문자열일 수 있음).
  targetIds: z.array(z.coerce.number().int().positive()).min(1).max(100_000),
  markedBy: z.string().max(64).optional(),
});

/**
 * POST /api/admin/export/mark — 운영자가 채널톡 발송을 완료한 대상을 'exported'로 전환.
 * 복사(읽기)와 분리하여, 실수로 보기만 한 경우 funnel이 왜곡되지 않도록 한다.
 */
adminExportRouter.post('/export/mark', async (req, res) => {
  const parsed = markSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'invalid_body', message: parsed.error.message } });
  }
  const { targetIds, markedBy } = parsed.data;

  const upd = await query<{ id: number }>(
    `UPDATE targets
        SET notification_status = 'exported',
            exported_at = NOW(),
            export_count = export_count + 1
      WHERE id = ANY($1::bigint[])
        AND notification_status = 'pending'
      RETURNING id`,
    [targetIds],
  );
  for (const row of upd.rows) {
    await insertEvent({
      targetId: row.id,
      eventType: 'bizm_exported',
      metadata: { marked_by: markedBy ?? null, channel: 'channeltalk' },
    });
  }
  res.json({
    ok: true,
    data: { marked: upd.rows.length, requested: targetIds.length },
  } satisfies ApiOk<{ marked: number; requested: number }>);
});

const excludeSchema = z.object({
  // 클라이언트가 문자열 id를 보내도 허용 (BIGSERIAL이 JSON에서 문자열일 수 있음).
  targetIds: z.array(z.coerce.number().int().positive()).min(1).max(100_000),
  excludedBy: z.string().max(64).optional(),
});

/**
 * POST /api/admin/export/exclude — 운영자가 발송 대상에서 제외한 대상을 'excluded'로 전환.
 * 발송하지 않기로 한 대상(오발송 위험·중복 등)을 대기 목록에서 빼되, exported와 구분해
 * funnel(발송 완료)에 섞이지 않도록 별도 상태로 둔다.
 */
adminExportRouter.post('/export/exclude', async (req, res) => {
  const parsed = excludeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'invalid_body', message: parsed.error.message } });
  }
  const { targetIds, excludedBy } = parsed.data;

  const upd = await query<{ id: number }>(
    `UPDATE targets
        SET notification_status = 'excluded'
      WHERE id = ANY($1::bigint[])
        AND notification_status = 'pending'
      RETURNING id`,
    [targetIds],
  );
  for (const row of upd.rows) {
    await insertEvent({
      targetId: row.id,
      eventType: 'bizm_excluded',
      metadata: { excluded_by: excludedBy ?? null },
    });
  }
  res.json({
    ok: true,
    data: { excluded: upd.rows.length, requested: targetIds.length },
  } satisfies ApiOk<{ excluded: number; requested: number }>);
});

interface HistoryRow {
  id: number;
  event_type: 'bizm_exported' | 'bizm_excluded';
  occurred_kst: string;
  target_id: number | null;
  manager_name: string | null;
  match_time: string | null;
  stadium_name: string | null;
  field_name: string | null;
  current_grade: number | null;
  operator: string | null;
  participant_count: number | null;
  export_count: number | null;
  notification_status: string | null;
  recommended_matches: RecommendedMatch[] | null;
}

/**
 * GET /api/admin/export/history?from=ISO&to=ISO&limit=N
 * 발송 완료(bizm_exported)·대상 제외(bizm_excluded)를 한 건씩 최신순으로 조회한다.
 * event_log를 targets와 LEFT JOIN해 매니저/매치 정보를 함께 보여준다.
 * (구버전 대상이 삭제됐으면 target 정보는 null로 남는다.)
 */
adminExportRouter.get('/export/history', async (req, res) => {
  const from = String(req.query.from ?? new Date(Date.now() - 30 * 86400_000).toISOString());
  const to = String(req.query.to ?? new Date().toISOString());
  const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 5000);

  const rowsRes = await query<HistoryRow>(
    `SELECT
        e.id,
        e.event_type,
        to_char(e.occurred_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') AS occurred_kst,
        e.target_id,
        t.manager_name,
        t.current_match_info->>'scheduleKst' AS match_time,
        t.current_match_info->>'stadiumName' AS stadium_name,
        t.current_match_info->>'fieldName' AS field_name,
        NULLIF(t.current_match_info->>'grade', '')::int AS current_grade,
        (t.current_match_info->>'participantCount')::int AS participant_count,
        t.export_count,
        t.notification_status,
        t.recommended_matches,
        COALESCE(e.metadata->>'marked_by', e.metadata->>'excluded_by') AS operator
       FROM event_log e
       LEFT JOIN targets t ON t.id = e.target_id
      WHERE e.event_type IN ('bizm_exported', 'bizm_excluded')
        AND e.occurred_at BETWEEN $1 AND $2
      ORDER BY e.occurred_at DESC, e.id DESC
      LIMIT $3`,
    [from, to, limit],
  );

  // 토글 상세용 타임라인: 위 목록에 등장한 대상들의 모든 이벤트를 한 번에 조회해 그룹핑.
  const targetIds = [...new Set(rowsRes.rows.map((r) => r.target_id).filter((id): id is number => id != null))];
  const timelineMap = new Map<number, ExportHistoryItem['timeline']>();
  if (targetIds.length > 0) {
    const tlRes = await query<{ target_id: number; event_type: EventType; occurred_kst: string }>(
      `SELECT target_id, event_type,
              to_char(occurred_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') AS occurred_kst
         FROM event_log
        WHERE target_id = ANY($1::bigint[])
        ORDER BY occurred_at ASC, id ASC`,
      [targetIds],
    );
    for (const r of tlRes.rows) {
      const tid = Number(r.target_id);
      const list = timelineMap.get(tid) ?? [];
      list.push({ eventType: r.event_type, occurredKst: r.occurred_kst });
      timelineMap.set(tid, list);
    }
  }

  // 카운트는 limit과 무관하게 기간 전체 기준으로 집계.
  const countRes = await query<{ event_type: string; n: string }>(
    `SELECT event_type, COUNT(*)::text AS n
       FROM event_log
      WHERE event_type IN ('bizm_exported', 'bizm_excluded')
        AND occurred_at BETWEEN $1 AND $2
      GROUP BY event_type`,
    [from, to],
  );
  const countOf = (t: string) => Number(countRes.rows.find((r) => r.event_type === t)?.n ?? 0);

  const items: ExportHistoryItem[] = rowsRes.rows.map((r) => ({
    id: Number(r.id),
    status: r.event_type === 'bizm_exported' ? 'exported' : 'excluded',
    occurredKst: r.occurred_kst,
    targetId: r.target_id != null ? Number(r.target_id) : null,
    managerName: r.manager_name,
    matchTime: r.match_time,
    stadiumName: r.stadium_name,
    fieldName: r.field_name,
    currentGrade: r.current_grade,
    operator: r.operator,
    participantCount: r.participant_count != null ? Number(r.participant_count) : null,
    exportCount: r.export_count != null ? Number(r.export_count) : null,
    notificationStatus: r.notification_status,
    recommended: r.recommended_matches ?? [],
    timeline: r.target_id != null ? timelineMap.get(Number(r.target_id)) ?? [] : [],
  }));

  const data: ExportHistoryReport = {
    range: { from, to },
    exportedCount: countOf('bizm_exported'),
    excludedCount: countOf('bizm_excluded'),
    items,
  };
  res.json({ ok: true, data } satisfies ApiOk<ExportHistoryReport>);
});

interface BackfillRow {
  id: number;
  current_match_info: CurrentMatch;
  recommended_matches: RecommendedMatch[] | null;
}

/**
 * POST /api/admin/targets/backfill-field-name
 * 구버전 추출분의 jsonb에 누락된 fieldName(plab.stadium.name, 개별 면)을 한 번에 보강한다.
 * - current_match_info.fieldName 또는 recommended_matches[].fieldName 키가 비어 있는
 *   targets row를 식별
 * - 필요한 모든 match_id를 모아 PLAB qFieldNames 한 번에 호출
 * - 각 row의 jsonb를 in-app으로 재구성해 UPDATE
 * idempotent — 이미 fieldName이 채워진 row는 건드리지 않는다.
 */
adminExportRouter.post('/targets/backfill-field-name', async (_req, res) => {
  const env = loadEnv();

  // 대상 row 식별: jsonb에 'fieldName' 키 자체가 없거나, recommended_matches 중 하나라도 fieldName 키가 없는 경우.
  const tr = await query<BackfillRow>(
    `SELECT id, current_match_info, recommended_matches
       FROM targets
      WHERE NOT (current_match_info ? 'fieldName')
         OR EXISTS (
           SELECT 1
             FROM jsonb_array_elements(COALESCE(recommended_matches, '[]'::jsonb)) AS rm
            WHERE NOT (rm ? 'fieldName')
         )`,
  );

  if (tr.rows.length === 0) {
    return res.json({
      ok: true,
      data: { examined: 0, updated: 0, plabQueried: 0, plabMissing: 0 },
    } satisfies ApiOk<{ examined: number; updated: number; plabQueried: number; plabMissing: number }>);
  }

  // 필요한 match_id 모두 수집 (중복 제거)
  const matchIds = new Set<number>();
  for (const t of tr.rows) {
    if (!t.current_match_info?.fieldName) matchIds.add(t.current_match_info.matchId);
    for (const r of t.recommended_matches ?? []) {
      if (!r?.fieldName) matchIds.add(r.matchId);
    }
  }

  let fieldNameMap = new Map<number, string | null>();
  try {
    const rows = await createPlabClient(env).qFieldNames([...matchIds]);
    fieldNameMap = new Map(rows.map((r) => [Number(r.id), r.field_name]));
  } catch (err) {
    log.error('backfill: plab field name lookup failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return res.status(502).json({
      ok: false,
      error: {
        code: 'plab_failed',
        message: 'PLAB qFieldNames 호출 실패. 잠시 후 재시도해 주세요.',
      },
    });
  }
  const plabMissing = [...matchIds].filter((id) => !fieldNameMap.has(id)).length;

  let updated = 0;
  for (const t of tr.rows) {
    let dirty = false;
    const current: CurrentMatch = { ...t.current_match_info };
    if (current.fieldName == null && fieldNameMap.has(current.matchId)) {
      current.fieldName = fieldNameMap.get(current.matchId) ?? null;
      dirty = true;
    }
    const recs: RecommendedMatch[] = (t.recommended_matches ?? []).map((r) => {
      if (r.fieldName == null && fieldNameMap.has(r.matchId)) {
        dirty = true;
        return { ...r, fieldName: fieldNameMap.get(r.matchId) ?? null };
      }
      return r;
    });
    if (!dirty) continue;
    await query(
      `UPDATE targets
          SET current_match_info = $1::jsonb,
              recommended_matches = $2::jsonb
        WHERE id = $3`,
      [JSON.stringify(current), JSON.stringify(recs), t.id],
    );
    updated += 1;
  }

  res.json({
    ok: true,
    data: {
      examined: tr.rows.length,
      updated,
      plabQueried: matchIds.size,
      plabMissing,
    },
  } satisfies ApiOk<{
    examined: number;
    updated: number;
    plabQueried: number;
    plabMissing: number;
  }>);
});
