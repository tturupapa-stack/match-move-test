import { Router } from 'express';
import { z } from 'zod';
import { loadEnv } from '../../env.js';
import { UNASSIGNED_MANAGER_ID } from '../../lib/constants.js';
import { query } from '../../lib/db.js';
import { hasAnyEvent, insertEvent } from '../../lib/event-log.js';
import { log } from '../../lib/logger.js';
import { createPlabClient } from '../../lib/plab-api-client.js';
import { createSlackClient } from '../../lib/slack-client.js';
import { verifyToken } from '../../lib/token.js';
import type {
  ApiOk,
  CurrentMatch,
  MatchMoveActionResult,
  MatchMoveState,
  RecommendedMatch,
} from '../../types/api.js';

export const matchMoveRouter: Router = Router();

interface TargetRow {
  id: number;
  manager_id: number;
  manager_name: string | null;
  current_match_id: number;
  current_match_info: CurrentMatch;
  recommended_matches: RecommendedMatch[];
  token_expires_at: string;
}

async function loadTarget(targetId: number): Promise<TargetRow | null> {
  const res = await query<TargetRow>(
    `SELECT id, manager_id, manager_name, current_match_id,
            current_match_info, recommended_matches, token_expires_at::text
       FROM targets WHERE id = $1`,
    [targetId],
  );
  return res.rows[0] ?? null;
}

/** GET /api/match-move/state?t=<token> */
matchMoveRouter.get('/state', async (req, res) => {
  const env = loadEnv();
  const token = String(req.query.t ?? '');
  if (!token) {
    const body: ApiOk<MatchMoveState> = { ok: true, data: { status: 'invalid_token' } };
    return res.json(body);
  }
  const ver = verifyToken(token, env.HMAC_SECRET);
  if (!ver.ok) {
    const data: MatchMoveState =
      ver.reason === 'expired' ? { status: 'deadline_passed' } : { status: 'invalid_token' };
    return res.json({ ok: true, data } satisfies ApiOk<MatchMoveState>);
  }
  const target = await loadTarget(ver.payload.tid);
  if (!target) {
    return res.json({ ok: true, data: { status: 'invalid_token' } } satisfies ApiOk<MatchMoveState>);
  }

  // Already actioned?
  const actioned = await hasAnyEvent(target.id, ['change_requested', 'kept_existing']);
  if (actioned) {
    return res.json({
      ok: true,
      data: { status: 'already_actioned' },
    } satisfies ApiOk<MatchMoveState>);
  }

  // Log page_entered
  await insertEvent({
    targetId: target.id,
    eventType: 'page_entered',
    metadata: { ua: req.headers['user-agent'] ?? null },
  }).catch((e) => log.error('page_entered insert failed', { err: String(e) }));

  // Re-fetch recommendation freshness via Q4
  const recs = target.recommended_matches ?? [];
  const matchIds = recs.map((r) => r.matchId);
  let liveRecs: RecommendedMatch[] = [];
  try {
    const plab = createPlabClient(env);
    const cfg = await query<{ high_threshold: number }>(
      `SELECT high_threshold FROM test_config ORDER BY id DESC LIMIT 1`,
    );
    const hi = cfg.rows[0]?.high_threshold ?? 6;
    const fresh = await plab.q4RefetchMatches(matchIds);
    const freshById = new Map(fresh.map((r) => [r.id, r]));
    liveRecs = recs.flatMap((r) => {
      const f = freshById.get(r.matchId);
      if (!f) return [];
      const stillReleasable =
        String(f.status).toLowerCase() === 'release' &&
        (f.manager_id === null ||
          f.manager_id === UNASSIGNED_MANAGER_ID ||
          f.manager_return === 1);
      const livePartic = Number(f.participant_count);
      if (!stillReleasable || livePartic < hi) return [];
      // 표시 참가자 수는 추출 시점 스냅샷이 아닌 Q4 실시간 값을 사용 (stale 표기 방지).
      return [{ ...r, participantCount: livePartic }];
    });
  } catch (err) {
    log.error('q4 failed; serving cached recs', {
      err: err instanceof Error ? err.message : String(err),
    });
    liveRecs = recs;
  }

  if (liveRecs.length === 0) {
    return res.json({
      ok: true,
      data: { status: 'no_recommendations', current: target.current_match_info },
    } satisfies ApiOk<MatchMoveState>);
  }
  return res.json({
    ok: true,
    data: {
      status: 'ok',
      current: target.current_match_info,
      // 매니저에게는 양도/프로모션 여부를 노출하지 않는다 (관리자 전용 정보).
      recommendations: liveRecs.map((r) => ({
        matchId: r.matchId,
        scheduleKst: r.scheduleKst,
        stadiumName: r.stadiumName,
        participantCount: r.participantCount,
      })),
    },
  } satisfies ApiOk<MatchMoveState>);
});

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    token: z.string().min(1),
    action: z.literal('select'),
    selectedMatchId: z.number().int().positive(),
  }),
  z.object({
    token: z.string().min(1),
    action: z.literal('keep'),
  }),
]);

/** POST /api/match-move/action */
matchMoveRouter.post('/action', async (req, res) => {
  const env = loadEnv();
  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) {
    const body: MatchMoveActionResult = { status: 'invalid_token' };
    return res.json({ ok: true, data: body });
  }
  const ver = verifyToken(parsed.data.token, env.HMAC_SECRET, { marginSeconds: 60 });
  if (!ver.ok) {
    const status: MatchMoveActionResult['status'] =
      ver.reason === 'expired' ? 'deadline_passed' : 'invalid_token';
    if (ver.reason === 'expired') {
      // Log it (best-effort) so funnel sees entered_after_deadline
      try {
        const skipExpiry = verifyToken(parsed.data.token, env.HMAC_SECRET, { skipExpiry: true });
        if (skipExpiry.ok) {
          await insertEvent({
            targetId: skipExpiry.payload.tid,
            eventType: 'entered_after_deadline',
            metadata: { source: 'action' },
          });
        }
      } catch {
        // ignore
      }
    }
    return res.json({ ok: true, data: { status } });
  }

  const target = await loadTarget(ver.payload.tid);
  if (!target) {
    return res.json({ ok: true, data: { status: 'invalid_token' } });
  }

  const actioned = await hasAnyEvent(target.id, ['change_requested', 'kept_existing']);
  if (actioned) {
    return res.json({ ok: true, data: { status: 'already_actioned' } });
  }

  const body = parsed.data;
  if (body.action === 'keep') {
    await insertEvent({ targetId: target.id, eventType: 'kept_existing' });
    try {
      const slack = createSlackClient(env);
      await slack.postKeep({
        targetId: target.id,
        managerName: target.manager_name ?? `manager_${target.manager_id}`,
        managerId: target.manager_id,
        current: {
          stadium: target.current_match_info.stadiumName,
          scheduleKst: target.current_match_info.scheduleKst,
          participants: target.current_match_info.participantCount,
        },
      });
    } catch (err) {
      log.error('slack keep failed', { err: err instanceof Error ? err.message : String(err) });
    }
    return res.json({ ok: true, data: { status: 'accepted' } });
  }

  // body.action === 'select' (narrowed)
  const selected = (target.recommended_matches ?? []).find(
    (r) => r.matchId === body.selectedMatchId,
  );
  if (!selected) {
    return res.json({ ok: true, data: { status: 'invalid_selection' } });
  }

  // Q5 to confirm transfer/promotion flags at action time
  let q5: Awaited<ReturnType<ReturnType<typeof createPlabClient>['q5MatchTags']>> = null;
  try {
    const plab = createPlabClient(env);
    q5 = await plab.q5MatchTags(selected.matchId);
  } catch (err) {
    log.warn('q5 failed; using cached', { err: err instanceof Error ? err.message : String(err) });
  }

  // 요청 직전 다른 매니저가 매치를 가져갔는지 실시간 확인.
  // 미정(manager 없음/미배정) 또는 양도(manager_return=1) 상태가 아니면 마감 안내.
  // q5 조회 실패(PLAB 일시 장애) 시에는 막지 않고 캐시 기반으로 진행 (best-effort).
  if (q5) {
    const stillReleasable =
      String(q5.status).toLowerCase() === 'release' &&
      (q5.manager_id === null ||
        q5.manager_id === UNASSIGNED_MANAGER_ID ||
        q5.manager_return === 1);
    if (!stillReleasable) {
      log.info('match closed before action', {
        targetId: target.id,
        matchId: selected.matchId,
        status: q5.status,
        managerId: q5.manager_id,
      });
      return res.json({ ok: true, data: { status: 'match_closed' } });
    }
  }

  const isTransferOrigin = q5 ? q5.manager_return === 1 : selected.isTransferOrigin;
  const testType = q5 ? q5.test_type : selected.isPromotion ? 3 : null;

  await insertEvent({
    targetId: target.id,
    eventType: 'change_requested',
    metadata: {
      selected_match_id: selected.matchId,
      is_transferred_origin: isTransferOrigin,
      test_type: testType,
    },
  });

  try {
    const slack = createSlackClient(env);
    await slack.postChangeRequest({
      targetId: target.id,
      managerName: target.manager_name ?? `manager_${target.manager_id}`,
      managerId: target.manager_id,
      current: {
        stadium: target.current_match_info.stadiumName,
        scheduleKst: target.current_match_info.scheduleKst,
        participants: target.current_match_info.participantCount,
      },
      selected: {
        matchId: selected.matchId,
        stadium: selected.stadiumName,
        scheduleKst: selected.scheduleKst,
        participants: selected.participantCount,
        isTransferOrigin,
        testType,
      },
    });
  } catch (err) {
    log.error('slack change-request failed', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
  return res.json({ ok: true, data: { status: 'accepted' } });
});
