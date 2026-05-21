import { loadEnv } from '../env.js';
import { query } from '../lib/db.js';
import { insertEventOnce } from '../lib/event-log.js';
import { log } from '../lib/logger.js';
import { PlabApiClient, createPlabClient } from '../lib/plab-api-client.js';

interface DueTarget {
  target_id: number;
  current_match_id: number;
  recommended_match_ids: number[];
}

/**
 * For each target whose match started >= 3h ago and which hasn't received a match_result event yet,
 * pull Q6 status and write a `match_result` event. Idempotent via insertEventOnce + a target+match key.
 */
export async function runCollectResults(now: Date = new Date()): Promise<{ processed: number }> {
  const env = loadEnv();
  void env; // ensure env validates even if plab not yet used
  const plab = createPlabClient(env);
  const cutoff = new Date(now.getTime() - 3 * 3600 * 1000);

  // Find targets whose current_match_info.matchId is recorded and where:
  //   - extracted_at <= now - 4h (rough guard so match has finished)
  //   - no match_result event yet for that target
  const res = await query<DueTarget>(
    `SELECT t.id AS target_id,
            t.current_match_id,
            COALESCE(
              (SELECT array_agg((rm->>'matchId')::int)
                 FROM jsonb_array_elements(t.recommended_matches) rm),
              ARRAY[]::int[]
            ) AS recommended_match_ids
       FROM targets t
       WHERE t.extracted_at <= $1
         AND NOT EXISTS (
           SELECT 1 FROM event_log el
           WHERE el.target_id = t.id AND el.event_type = 'match_result'
         )
       LIMIT 50`,
    [cutoff.toISOString()],
  );

  if (res.rowCount === 0) return { processed: 0 };

  let processed = 0;
  for (const row of res.rows) {
    const ids = Array.from(new Set([row.current_match_id, ...(row.recommended_match_ids ?? [])])).filter(
      (n): n is number => Number.isInteger(n),
    );
    if (ids.length === 0) continue;
    try {
      const results = await plab.q6MatchResults(ids);
      const r = await insertEventOnce({
        targetId: row.target_id,
        eventType: 'match_result',
        metadata: { results },
      });
      if (r.inserted) processed += 1;
    } catch (err) {
      log.error('collect-results q6 failed', {
        target_id: row.target_id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  log.info('collect-results done', { processed });
  return { processed };
}
