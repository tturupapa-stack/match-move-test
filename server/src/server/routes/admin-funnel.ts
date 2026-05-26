import { Router } from 'express';
import { query } from '../../lib/db.js';
import type {
  ApiOk,
  FunnelBucketRow,
  FunnelCostBreakdown,
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

  // Cost savings: for change_completed where is_transferred_origin=true AND promotion_released_amount IS NOT NULL.
  // 동시에 누락 진단(breakdown)도 수집해 'change_completed는 있는데 절감 금액이 0인' 이유를 분류한다.
  const costRes = await query<{
    completed_total: string;
    completed_with_transfer: string;
    completed_with_amount: string;
    total_amount: string;
    // breakdown: 양도였지만 금액 없는 건의 사유 분해
    missing_no_test_type: string; // change_requested.test_type이 NULL이었던 경우
    missing_no_mapping: string; // test_type은 있는데 promotion_amount_map에 행 없음
  }>(
    `WITH completed AS (
       SELECT el.target_id, el.metadata,
              -- 같은 target의 최신 change_requested 메타 (test_type 진단용)
              (SELECT (cr.metadata->>'test_type')::int
                 FROM event_log cr
                WHERE cr.target_id = el.target_id
                  AND cr.event_type = 'change_requested'
                ORDER BY cr.occurred_at DESC LIMIT 1) AS req_test_type
         FROM event_log el
        WHERE el.event_type = 'change_completed'
          AND el.occurred_at BETWEEN $1 AND $2
     )
     SELECT
       COUNT(*)::text AS completed_total,
       COUNT(*) FILTER (WHERE (metadata->>'is_transferred_origin')::boolean = true)::text
         AS completed_with_transfer,
       COUNT(*) FILTER (
         WHERE (metadata->>'is_transferred_origin')::boolean = true
           AND (metadata->>'promotion_released_amount') IS NOT NULL
       )::text AS completed_with_amount,
       COALESCE(SUM((metadata->>'promotion_released_amount')::int) FILTER (
         WHERE (metadata->>'is_transferred_origin')::boolean = true
           AND (metadata->>'promotion_released_amount') IS NOT NULL
       ), 0)::text AS total_amount,
       -- 양도였는데 금액 누락된 건들의 사유
       COUNT(*) FILTER (
         WHERE (metadata->>'is_transferred_origin')::boolean = true
           AND (metadata->>'promotion_released_amount') IS NULL
           AND req_test_type IS NULL
       )::text AS missing_no_test_type,
       COUNT(*) FILTER (
         WHERE (metadata->>'is_transferred_origin')::boolean = true
           AND (metadata->>'promotion_released_amount') IS NULL
           AND req_test_type IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM promotion_amount_map pam
             WHERE pam.test_type = req_test_type
           )
       )::text AS missing_no_mapping
     FROM completed`,
    [from, to],
  );

  const steps = stepsFromCounts(counts);
  const derived = derive(steps);
  const c = costRes.rows[0];
  const completedTransferPromotion = Number(c?.completed_with_amount ?? 0);
  const totalEstimatedAmount = Number(c?.total_amount ?? 0);
  const breakdown: FunnelCostBreakdown = {
    completedTotal: Number(c?.completed_total ?? 0),
    completedWithTransfer: Number(c?.completed_with_transfer ?? 0),
    completedWithAmount: Number(c?.completed_with_amount ?? 0),
    missingAmount: {
      noTestType: Number(c?.missing_no_test_type ?? 0),
      noMapping: Number(c?.missing_no_mapping ?? 0),
    },
  };

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
    costSavings: { completedTransferPromotion, totalEstimatedAmount, breakdown },
    ...(bucket ? { bucket, series } : {}),
  };
  res.json({ ok: true, data } satisfies ApiOk<FunnelReport>);
});

/**
 * POST /api/admin/funnel/recompute-promotion?from=ISO&to=ISO
 * 기간 내 change_completed 이벤트 중 promotion_released_amount 또는 is_transferred_origin이
 * 누락된 건을 찾아, 같은 target의 최신 change_requested.test_type + promotion_amount_map으로
 * 재계산해 event_log.metadata에 머지(jsonb concat)한다.
 *
 * 운영자가 ✅ 반응을 눌렀는데도 부차 지표가 0으로 나오는 경우 사용 (PLAB q5 일시 장애,
 * promotion_amount_map 늦은 입력, 구버전 이벤트 마이그레이션 등 원인이 복합적일 수 있음).
 * 이미 값이 있는 건은 건드리지 않는다 (idempotent).
 */
adminFunnelRouter.post('/funnel/recompute-promotion', async (req, res) => {
  const from = String(req.query.from ?? new Date(Date.now() - 30 * 86400_000).toISOString());
  const to = String(req.query.to ?? new Date().toISOString());

  // 후보 = is_transferred_origin 키가 없거나 false-not-set, 또는 promotion_released_amount가 null.
  // (true/false 명시된 건은 그대로 유지하고 amount만 보강한다.)
  const candidates = await query<{
    id: number;
    target_id: number;
    has_transfer_flag: boolean;
    has_amount: boolean;
    req_test_type: number | null;
    req_transfer: boolean | null;
  }>(
    `SELECT el.id, el.target_id,
            (el.metadata ? 'is_transferred_origin') AS has_transfer_flag,
            (el.metadata ? 'promotion_released_amount'
              AND (el.metadata->>'promotion_released_amount') IS NOT NULL) AS has_amount,
            (SELECT (cr.metadata->>'test_type')::int
               FROM event_log cr
              WHERE cr.target_id = el.target_id
                AND cr.event_type = 'change_requested'
              ORDER BY cr.occurred_at DESC LIMIT 1) AS req_test_type,
            (SELECT (cr.metadata->>'is_transferred_origin')::boolean
               FROM event_log cr
              WHERE cr.target_id = el.target_id
                AND cr.event_type = 'change_requested'
              ORDER BY cr.occurred_at DESC LIMIT 1) AS req_transfer
       FROM event_log el
      WHERE el.event_type = 'change_completed'
        AND el.occurred_at BETWEEN $1 AND $2
        AND (
          (el.metadata->>'promotion_released_amount') IS NULL
          OR (el.metadata ? 'is_transferred_origin') = false
        )`,
    [from, to],
  );

  let updated = 0;
  let stillMissingAmount = 0;
  for (const row of candidates.rows) {
    const patch: Record<string, unknown> = {};
    if (!row.has_transfer_flag && row.req_transfer !== null) {
      patch.is_transferred_origin = row.req_transfer;
    }
    if (!row.has_amount && row.req_test_type !== null) {
      const lookup = await query<{ amount: number }>(
        `SELECT amount FROM promotion_amount_map WHERE test_type = $1`,
        [row.req_test_type],
      );
      const amt = lookup.rows[0]?.amount;
      if (amt != null) {
        patch.promotion_released_amount = amt;
      } else {
        stillMissingAmount += 1;
      }
    } else if (!row.has_amount) {
      // req_test_type 자체가 null → 매핑 불가
      stillMissingAmount += 1;
    }
    if (Object.keys(patch).length === 0) continue;
    await query(
      `UPDATE event_log
          SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
        WHERE id = $2`,
      [JSON.stringify(patch), row.id],
    );
    updated += 1;
  }

  res.json({
    ok: true,
    data: {
      examined: candidates.rows.length,
      updated,
      stillMissingAmount,
      range: { from, to },
    },
  } satisfies ApiOk<{
    examined: number;
    updated: number;
    stillMissingAmount: number;
    range: { from: string; to: string };
  }>);
});
