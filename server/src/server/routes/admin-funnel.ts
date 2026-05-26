import { Router } from 'express';
import { query } from '../../lib/db.js';
import type {
  ApiOk,
  FunnelBucketRow,
  FunnelDerived,
  FunnelReport,
  FunnelSteps,
  ReportBucket,
} from '../../types/api.js';

export const adminFunnelRouter: Router = Router();

/** event_type → FunnelSteps 필드명 매핑. 추가되면 stepsFromCounts에 한 줄 추가. */
function stepsFromCounts(counts: Record<string, number>): FunnelSteps {
  return {
    extracted: counts['extracted'] ?? 0,
    exported: counts['bizm_exported'] ?? 0,
    pageEntered: counts['page_entered'] ?? 0,
    changeRequested: counts['change_requested'] ?? 0,
    keptExisting: counts['kept_existing'] ?? 0,
    noResponse: counts['no_response'] ?? 0,
    changeCompleted: counts['change_completed'] ?? 0,
  };
}

function derive(steps: FunnelSteps): FunnelDerived {
  return {
    // 이동 요청률 분모: 발송 자료 추출(=실 발송) 건수
    changeRequestRate: steps.exported === 0 ? 0 : steps.changeRequested / steps.exported,
    completionRate: steps.changeRequested === 0 ? 0 : steps.changeCompleted / steps.changeRequested,
  };
}

function parseBucket(raw: unknown): ReportBucket | undefined {
  return raw === 'day' || raw === 'week' ? raw : undefined;
}

/** GET /api/admin/funnel?from=ISO&to=ISO&bucket=day|week */
adminFunnelRouter.get('/funnel', async (req, res) => {
  const from = String(req.query.from ?? new Date(Date.now() - 7 * 86400_000).toISOString());
  const to = String(req.query.to ?? new Date().toISOString());
  const bucket = parseBucket(req.query.bucket);

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

  const steps = stepsFromCounts(counts);
  const derived = derive(steps);
  const completedTransferPromotion = Number(costRes.rows[0]?.n ?? 0);
  const totalEstimatedAmount = Number(costRes.rows[0]?.total ?? 0);

  // 시계열 — bucket 지정 시에만 추가 쿼리.
  // KST 기준 date_trunc → 'YYYY-MM-DD' 문자열. week는 ISO 월요일.
  let series: FunnelBucketRow[] | undefined;
  if (bucket) {
    const seriesRes = await query<{ bucket: string; event_type: string; n: string }>(
      `SELECT to_char(date_trunc($3, occurred_at AT TIME ZONE 'Asia/Seoul'), 'YYYY-MM-DD') AS bucket,
              event_type,
              COUNT(*)::text AS n
         FROM event_log
        WHERE occurred_at BETWEEN $1 AND $2
        GROUP BY bucket, event_type
        ORDER BY bucket ASC`,
      [from, to, bucket],
    );
    // bucket별로 counts 집계 → steps/derived 변환.
    const byBucket = new Map<string, Record<string, number>>();
    for (const row of seriesRes.rows) {
      const m = byBucket.get(row.bucket) ?? {};
      m[row.event_type] = Number(row.n);
      byBucket.set(row.bucket, m);
    }
    series = [...byBucket.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucketStart, c]) => {
        const s = stepsFromCounts(c);
        return { bucketStart, steps: s, derived: derive(s) };
      });
  }

  const data: FunnelReport = {
    range: { from, to },
    steps,
    derived,
    costSavings: { completedTransferPromotion, totalEstimatedAmount },
    ...(bucket ? { bucket, series } : {}),
  };
  res.json({ ok: true, data } satisfies ApiOk<FunnelReport>);
});
