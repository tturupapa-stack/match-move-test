// POST /api/match-move/survey
// 매니저가 추천 페이지에서 액션(select/keep)을 마친 직후 노출되는 후속 설문 응답을 수신한다.
// - 토큰을 통해 target을 식별 (만료 마진은 1시간 — 마감 직전 액션 후 답변이 일부 지연될 수 있음)
// - 액션 이력(change_requested/kept_existing)이 있어야 제출 가능, actionType과 실제 액션이 일치해야 함
// - 1 target당 1회만 허용 (UNIQUE constraint)
import { Router } from 'express';
import { z } from 'zod';
import { loadEnv } from '../../env.js';
import { query } from '../../lib/db.js';
import { insertEvent } from '../../lib/event-log.js';
import { log } from '../../lib/logger.js';
import { verifyToken } from '../../lib/token.js';
import {
  SURVEY_KEEP_REASONS,
  SURVEY_SELECT_REASONS,
  type ApiOk,
  type SurveySubmitResult,
} from '../../types/api.js';

export const surveyRouter: Router = Router();

const submitSchema = z.object({
  token: z.string().min(1),
  actionType: z.enum(['select', 'keep']),
  reasons: z.array(z.string().min(1)).max(10).default([]),
  otherText: z.string().max(500).optional(),
  suggestion: z.string().max(2000).optional(),
});

function validateReasons(actionType: 'select' | 'keep', reasons: string[]): boolean {
  const allowed: readonly string[] =
    actionType === 'keep' ? SURVEY_KEEP_REASONS : SURVEY_SELECT_REASONS;
  return reasons.every((r) => allowed.includes(r));
}

surveyRouter.post('/survey', async (req, res) => {
  const env = loadEnv();
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.json({ ok: true, data: { status: 'invalid_body' } } satisfies ApiOk<SurveySubmitResult>);
  }
  const body = parsed.data;

  // 설문은 액션 직후 노출되며 액션 이력으로 정당성을 보장하므로,
  // 토큰은 서명·포맷만 검증하고 deadline은 확인하지 않는다.
  // (액션 후 설문을 채우는 동안 마감이 지나도 응답을 받을 수 있게 함)
  const ver = verifyToken(body.token, env.HMAC_SECRET, { skipExpiry: true });
  if (!ver.ok) {
    return res.json({
      ok: true,
      data: { status: 'invalid_token' },
    } satisfies ApiOk<SurveySubmitResult>);
  }

  if (!validateReasons(body.actionType, body.reasons)) {
    return res.json({ ok: true, data: { status: 'invalid_body' } } satisfies ApiOk<SurveySubmitResult>);
  }

  // target 존재 확인
  const targetRes = await query<{ id: number }>(`SELECT id FROM targets WHERE id = $1`, [
    ver.payload.tid,
  ]);
  const target = targetRes.rows[0];
  if (!target) {
    return res.json({
      ok: true,
      data: { status: 'invalid_token' },
    } satisfies ApiOk<SurveySubmitResult>);
  }

  // 액션 이력 확인 — actionType과 실제 액션이 일치해야 함.
  const actionRes = await query<{ event_type: string }>(
    `SELECT event_type
       FROM event_log
      WHERE target_id = $1
        AND event_type IN ('change_requested', 'kept_existing')
      ORDER BY occurred_at ASC
      LIMIT 1`,
    [target.id],
  );
  const action = actionRes.rows[0];
  if (!action) {
    return res.json({
      ok: true,
      data: { status: 'no_action_yet' },
    } satisfies ApiOk<SurveySubmitResult>);
  }
  const expected = body.actionType === 'select' ? 'change_requested' : 'kept_existing';
  if (action.event_type !== expected) {
    return res.json({
      ok: true,
      data: { status: 'action_mismatch' },
    } satisfies ApiOk<SurveySubmitResult>);
  }

  // INSERT — UNIQUE(target_id) 위반 시 already_submitted 응답
  const otherText = body.otherText?.trim() || null;
  const suggestion = body.suggestion?.trim() || null;
  try {
    await query(
      `INSERT INTO survey_responses (target_id, action_type, reasons, other_text, suggestion)
       VALUES ($1, $2, $3, $4, $5)`,
      [target.id, body.actionType, body.reasons, otherText, suggestion],
    );
  } catch (err) {
    // unique_violation
    const code = (err as { code?: string } | null)?.code;
    if (code === '23505') {
      return res.json({
        ok: true,
        data: { status: 'already_submitted' },
      } satisfies ApiOk<SurveySubmitResult>);
    }
    log.error('survey insert failed', { err: err instanceof Error ? err.message : String(err) });
    throw err;
  }

  await insertEvent({
    targetId: target.id,
    eventType: 'survey_submitted',
    metadata: {
      action_type: body.actionType,
      reasons: body.reasons,
      has_other: Boolean(otherText),
      has_suggestion: Boolean(suggestion),
    },
  }).catch((e) => log.error('survey_submitted event insert failed', { err: String(e) }));

  return res.json({
    ok: true,
    data: { status: 'accepted' },
  } satisfies ApiOk<SurveySubmitResult>);
});
