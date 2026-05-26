import { Router } from 'express';
import { query } from '../../lib/db.js';
import type { ApiOk, ReportBucket, StatsBucketRow, StatsReport } from '../../types/api.js';

export const adminStatsRouter: Router = Router();

function parseBucket(raw: unknown): ReportBucket | undefined {
  return raw === 'day' || raw === 'week' ? raw : undefined;
}

/**
 * GET /api/admin/stats?from=ISO&to=ISO&bucket=day|week
 * extracted 이벤트 metadata에 누적된 추출 통계를 집계한다.
 *   - recommended_count: 대상당 제안된 추천 매치 수
 *   - area_id / area_name: 현재 매치가 속한 지역구
 * (구버전 extracted 이벤트엔 area 정보가 없을 수 있어 '(미상)'으로 묶인다.)
 * bucket=day|week 지정 시 시계열(series)도 함께 반환 (KST 기준).
 */
adminStatsRouter.get('/stats', async (req, res) => {
  const from = String(req.query.from ?? new Date(Date.now() - 7 * 86400_000).toISOString());
  const to = String(req.query.to ?? new Date().toISOString());
  const bucket = parseBucket(req.query.bucket);

  // 추천 매치 수: 전체/평균/분포
  const recRes = await query<{ targets: string; avg: string | null }>(
    `SELECT COUNT(*)::text AS targets,
            AVG((metadata->>'recommended_count')::int) AS avg
       FROM event_log
      WHERE event_type = 'extracted'
        AND occurred_at BETWEEN $1 AND $2
        AND metadata ? 'recommended_count'`,
    [from, to],
  );
  const distRes = await query<{ count: number; targets: string }>(
    `SELECT (metadata->>'recommended_count')::int AS count,
            COUNT(*)::text AS targets
       FROM event_log
      WHERE event_type = 'extracted'
        AND occurred_at BETWEEN $1 AND $2
        AND metadata ? 'recommended_count'
      GROUP BY count
      ORDER BY count ASC`,
    [from, to],
  );

  // 지역구별 대상 수
  const areaRes = await query<{ area_id: number | null; area_name: string | null; targets: string }>(
    `SELECT (metadata->>'area_id')::int AS area_id,
            metadata->>'area_name' AS area_name,
            COUNT(*)::text AS targets
       FROM event_log
      WHERE event_type = 'extracted'
        AND occurred_at BETWEEN $1 AND $2
      GROUP BY area_id, area_name
      ORDER BY COUNT(*) DESC`,
    [from, to],
  );

  // 시계열 — bucket 지정 시에만 추가 쿼리.
  // KST 기준 date_trunc → 'YYYY-MM-DD'. 분모/평균 모두 totals와 동일하게
  // `metadata ? 'recommended_count'` 필터를 적용 (총합과 시계열 합이 일치).
  let series: StatsBucketRow[] | undefined;
  if (bucket) {
    const seriesRes = await query<{ bucket: string; targets: string; avg: string | null }>(
      `SELECT to_char(date_trunc($3, occurred_at AT TIME ZONE 'Asia/Seoul'), 'YYYY-MM-DD') AS bucket,
              COUNT(*)::text AS targets,
              AVG((metadata->>'recommended_count')::int) AS avg
         FROM event_log
        WHERE event_type = 'extracted'
          AND occurred_at BETWEEN $1 AND $2
          AND metadata ? 'recommended_count'
        GROUP BY bucket
        ORDER BY bucket ASC`,
      [from, to, bucket],
    );
    series = seriesRes.rows.map((r) => ({
      bucketStart: r.bucket,
      targets: Number(r.targets),
      avgRecommended: r.avg == null ? 0 : Number(r.avg),
    }));
  }

  const data: StatsReport = {
    range: { from, to },
    recommended: {
      targets: Number(recRes.rows[0]?.targets ?? 0),
      avg: Number(recRes.rows[0]?.avg ?? 0),
      distribution: distRes.rows.map((r) => ({ count: r.count, targets: Number(r.targets) })),
    },
    areas: areaRes.rows.map((r) => ({
      areaId: r.area_id,
      areaName: r.area_name ?? '(미상)',
      targets: Number(r.targets),
    })),
    ...(bucket ? { bucket, series } : {}),
  };
  res.json({ ok: true, data } satisfies ApiOk<StatsReport>);
});
