import { query } from '../lib/db.js';
import { insertEventOnce } from '../lib/event-log.js';
import { log } from '../lib/logger.js';

interface NoResponseTarget {
  id: number;
}

// 토큰 60초 마진(verifyToken marginSeconds) + 시계 오차를 고려한 안전 버퍼.
const DEADLINE_BUFFER_MINUTES = 5;

/**
 * 발송 완료(notification_status='exported') 후 마감 시각(token_expires_at = 매치 시작 1h30m 전)까지
 * 변경 요청/유지 선택을 하지 않은 대상을 '무응답'으로 간주해 no_response 이벤트를 기록한다.
 *
 * - 다른 매니저가 매치를 가져가 선택하지 못한 경우(match_closed)도, 결국 마감까지 무응답이면 여기서 집계된다.
 * - insertEventOnce + NOT EXISTS 이중 멱등 → 재실행해도 중복 기록되지 않는다.
 * - 'excluded'/'pending' 상태는 발송되지 않았으므로 제외된다 (Q: 발송 완료 대상만).
 */
export async function runMarkNoResponse(now: Date = new Date()): Promise<{ marked: number }> {
  const cutoff = new Date(now.getTime() - DEADLINE_BUFFER_MINUTES * 60 * 1000);

  const res = await query<NoResponseTarget>(
    `SELECT t.id
       FROM targets t
      WHERE t.notification_status = 'exported'
        AND t.token_expires_at < $1
        AND NOT EXISTS (
          SELECT 1 FROM event_log el
           WHERE el.target_id = t.id
             AND el.event_type IN ('change_requested', 'kept_existing', 'no_response')
        )
      ORDER BY t.token_expires_at ASC
      LIMIT 100`,
    [cutoff.toISOString()],
  );

  if (res.rowCount === 0) return { marked: 0 };

  let marked = 0;
  for (const row of res.rows) {
    try {
      const r = await insertEventOnce({
        targetId: row.id,
        eventType: 'no_response',
        metadata: { reason: 'deadline_no_response' },
      });
      if (r.inserted) marked += 1;
    } catch (err) {
      log.error('mark-no-response insert failed', {
        target_id: row.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  log.info('mark-no-response done', { marked });
  return { marked };
}
