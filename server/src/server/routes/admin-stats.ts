import { Router } from 'express';
import { query } from '../../lib/db.js';
import type { ApiOk, StatsReport } from '../../types/api.js';

export const adminStatsRouter: Router = Router();

/**
 * GET /api/admin/stats?from=ISO&to=ISO
 * extracted 이벤트 metadata에 누적된 추출 통계를 집계한다.
 *   - recommended_count: 대상당 제안된 추천 매치 수
 *   - area_id / area_name: 현재 매치가 속한 지역구
 * (구버전 extracted 이벤트엔 area 정보가 없을 수 있어 '(미상)'으로 묶인다.)
 */
adminStatsRouter.get('/stats', async (req, res) => {
  const from = String(req.query.from ?? new Date(Date.now() - 7 * 86400_000).toISOString());
  const to = String(req.query.to ?? new Date().toISOString());

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
  };
  res.json({ ok: true, data } satisfies ApiOk<StatsReport>);
});
