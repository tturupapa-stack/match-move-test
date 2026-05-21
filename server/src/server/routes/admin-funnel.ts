import { Router } from 'express';
import { query } from '../../lib/db.js';
import type { ApiOk, FunnelReport } from '../../types/api.js';

export const adminFunnelRouter: Router = Router();

/** GET /api/admin/funnel?from=ISO&to=ISO */
adminFunnelRouter.get('/funnel', async (req, res) => {
  const from = String(req.query.from ?? new Date(Date.now() - 7 * 86400_000).toISOString());
  const to = String(req.query.to ?? new Date().toISOString());

  const countsRes = await query<{ event_type: string; n: string }>(
    `SELECT event_type, COUNT(*)::text AS n
       FROM event_log
       WHERE occurred_at BETWEEN $1 AND $2
       GROUP BY event_type`,
    [from, to],
  );
  const counts: Record<string, number> = {};
  for (const r of countsRes.rows) counts[r.event_type] = Number(r.n);

  // Cost savings: for change_completed where is_transferred_origin=true AND promotion_released_amount IS NOT NULL
  const costRes = await query<{ n: string; total: string }>(
    `SELECT COUNT(*)::text AS n,
            COALESCE(SUM((metadata->>'promotion_released_amount')::int), 0)::text AS total
       FROM event_log
       WHERE event_type = 'change_completed'
         AND occurred_at BETWEEN $1 AND $2
         AND (metadata->>'is_transferred_origin')::boolean = true
         AND (metadata->>'promotion_released_amount') IS NOT NULL`,
    [from, to],
  );

  const steps = {
    extracted: counts['extracted'] ?? 0,
    exported: counts['bizm_exported'] ?? 0,
    pageEntered: counts['page_entered'] ?? 0,
    changeRequested: counts['change_requested'] ?? 0,
    keptExisting: counts['kept_existing'] ?? 0,
    noResponse: counts['no_response'] ?? 0,
    changeCompleted: counts['change_completed'] ?? 0,
  };
  const derived = {
    // 이동 요청률 분모: 발송 자료 추출(=실 발송) 건수
    changeRequestRate: steps.exported === 0 ? 0 : steps.changeRequested / steps.exported,
    completionRate: steps.changeRequested === 0 ? 0 : steps.changeCompleted / steps.changeRequested,
  };
  const completedTransferPromotion = Number(costRes.rows[0]?.n ?? 0);
  const totalEstimatedAmount = Number(costRes.rows[0]?.total ?? 0);

  const data: FunnelReport = {
    range: { from, to },
    steps,
    derived,
    costSavings: { completedTransferPromotion, totalEstimatedAmount },
  };
  res.json({ ok: true, data } satisfies ApiOk<FunnelReport>);
});
