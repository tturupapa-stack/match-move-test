// GET /api/admin/surveys?from=ISO&to=ISO
// 매니저 후속 설문(survey_responses) 누적 응답을 어드민이 조회한다.
// - 액션 유형별 총건수, 사유 코드별 분포 (내림차순)
// - 응답 목록(최신순) — 매니저/매치 컨텍스트는 targets 조인으로 단순 스냅샷 표시
import { Router } from 'express';
import { query } from '../../lib/db.js';
import type {
  ApiOk,
  SurveyActionType,
  SurveyReasonBreakdown,
  SurveyReport,
  SurveyResponseItem,
} from '../../types/api.js';

export const adminSurveyRouter: Router = Router();

interface ListRow {
  id: string;
  target_id: string;
  manager_name: string | null;
  action_type: string;
  reasons: string[] | null;
  other_text: string | null;
  suggestion: string | null;
  submitted_kst: string;
  current_match_time: string | null;
  current_stadium_name: string | null;
}

interface BreakdownRow {
  reason: string;
  n: string;
}

adminSurveyRouter.get('/surveys', async (req, res) => {
  const from = String(req.query.from ?? new Date(Date.now() - 30 * 86400_000).toISOString());
  const to = String(req.query.to ?? new Date().toISOString());

  // 총건수 (액션 유형별)
  const totalsRes = await query<{ action_type: string; n: string }>(
    `SELECT action_type, COUNT(*)::text AS n
       FROM survey_responses
      WHERE submitted_at BETWEEN $1 AND $2
      GROUP BY action_type`,
    [from, to],
  );
  let keepTotal = 0;
  let selectTotal = 0;
  for (const r of totalsRes.rows) {
    if (r.action_type === 'keep') keepTotal = Number(r.n);
    else if (r.action_type === 'select') selectTotal = Number(r.n);
  }

  // 사유 분포 — reasons 배열을 unnest해서 액션 유형별로 카운트
  const breakdownRes = await query<{ action_type: string; reason: string; n: string }>(
    `SELECT action_type, reason, COUNT(*)::text AS n
       FROM (
         SELECT action_type, unnest(reasons) AS reason
           FROM survey_responses
          WHERE submitted_at BETWEEN $1 AND $2
       ) t
      GROUP BY action_type, reason
      ORDER BY action_type, COUNT(*) DESC`,
    [from, to],
  );
  const keepReasons: SurveyReasonBreakdown[] = [];
  const selectReasons: SurveyReasonBreakdown[] = [];
  for (const r of breakdownRes.rows) {
    const item: SurveyReasonBreakdown = { reason: r.reason, count: Number(r.n) };
    if (r.action_type === 'keep') keepReasons.push(item);
    else if (r.action_type === 'select') selectReasons.push(item);
  }

  // 응답 목록 — targets 조인으로 매치 컨텍스트 한 줄 스냅샷
  const listRes = await query<ListRow>(
    `SELECT sr.id::text AS id,
            sr.target_id::text AS target_id,
            t.manager_name,
            sr.action_type,
            sr.reasons,
            sr.other_text,
            sr.suggestion,
            to_char(sr.submitted_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') AS submitted_kst,
            t.current_match_info->>'scheduleKst' AS current_match_time,
            t.current_match_info->>'stadiumName' AS current_stadium_name
       FROM survey_responses sr
       LEFT JOIN targets t ON t.id = sr.target_id
      WHERE sr.submitted_at BETWEEN $1 AND $2
      ORDER BY sr.submitted_at DESC
      LIMIT 500`,
    [from, to],
  );

  const items: SurveyResponseItem[] = listRes.rows.map((r) => ({
    id: Number(r.id),
    targetId: Number(r.target_id),
    managerName: r.manager_name,
    actionType: r.action_type as SurveyActionType,
    reasons: r.reasons ?? [],
    otherText: r.other_text,
    suggestion: r.suggestion,
    submittedKst: r.submitted_kst,
    currentMatchTime: r.current_match_time,
    currentStadiumName: r.current_stadium_name,
  }));

  const data: SurveyReport = {
    range: { from, to },
    totals: {
      all: keepTotal + selectTotal,
      keep: keepTotal,
      select: selectTotal,
    },
    reasons: { keep: keepReasons, select: selectReasons },
    items,
  };
  res.json({ ok: true, data } satisfies ApiOk<SurveyReport>);
});
