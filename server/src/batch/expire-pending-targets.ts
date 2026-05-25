import { query } from '../lib/db.js';
import { insertEventOnce } from '../lib/event-log.js';
import { log } from '../lib/logger.js';

// mark-no-response와 동일 안전 버퍼.
const DEADLINE_BUFFER_MINUTES = 5;

/**
 * pending(미발송) 중 발송 마감(token_expires_at = 매치 시작 1h30m 전)이 지난 대상을
 * 자동으로 'excluded'로 전환한다. 매니저가 페이지에서 액션할 수 없는 시점이므로 발송 무의미.
 *
 * - mark-no-response는 exported(발송 완료) 후 무응답을 처리 → 보완 관계.
 * - 운영자가 수동으로 'excluded' 처리(POST /export/exclude)한 것과 구분되도록
 *   metadata.excluded_by='auto', reason='expired_deadline'로 감사 흔적을 남긴다.
 * - insertEventOnce로 멱등성 보장 (재실행해도 중복 이벤트 없음).
 */
export async function runExpirePendingTargets(
  now: Date = new Date(),
): Promise<{ excluded: number }> {
  const cutoff = new Date(now.getTime() - DEADLINE_BUFFER_MINUTES * 60 * 1000);

  const res = await query<{ id: number }>(
    `UPDATE targets
        SET notification_status = 'excluded'
      WHERE notification_status = 'pending'
        AND token_expires_at < $1
      RETURNING id`,
    [cutoff.toISOString()],
  );

  if (res.rowCount === 0) return { excluded: 0 };

  for (const row of res.rows) {
    try {
      await insertEventOnce({
        targetId: row.id,
        eventType: 'bizm_excluded',
        metadata: { excluded_by: 'auto', reason: 'expired_deadline' },
      });
    } catch (err) {
      log.error('expire-pending event insert failed', {
        target_id: row.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  log.info('expire-pending done', { excluded: res.rowCount });
  return { excluded: res.rowCount };
}
