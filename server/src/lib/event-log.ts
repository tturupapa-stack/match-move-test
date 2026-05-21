import { query, withTx } from './db.js';
import type { EventType } from '../types/api.js';

export interface InsertEventArgs {
  targetId: number | null;
  eventType: EventType;
  metadata?: Record<string, unknown>;
}

export async function insertEvent(args: InsertEventArgs): Promise<{ id: number }> {
  const res = await query<{ id: number }>(
    `INSERT INTO event_log (target_id, event_type, metadata)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id`,
    [args.targetId, args.eventType, args.metadata ? JSON.stringify(args.metadata) : null],
  );
  // noUncheckedIndexedAccess — rows[0] is possibly undefined per types
  const row = res.rows[0];
  if (!row) throw new Error('event insert did not return a row');
  return { id: row.id };
}

/**
 * Idempotent insert: only inserts if no existing row of same (targetId, eventType).
 * Used for `change_completed` (ADR-008) and similar guarded events.
 */
export async function insertEventOnce(args: InsertEventArgs): Promise<{ inserted: boolean; id: number | null }> {
  return withTx(async (client) => {
    if (args.targetId !== null) {
      const exists = await client.query(
        `SELECT 1 FROM event_log WHERE target_id = $1 AND event_type = $2 LIMIT 1`,
        [args.targetId, args.eventType],
      );
      if (exists.rowCount && exists.rowCount > 0) {
        return { inserted: false, id: null };
      }
    }
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO event_log (target_id, event_type, metadata)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id`,
      [args.targetId, args.eventType, args.metadata ? JSON.stringify(args.metadata) : null],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error('event insert did not return a row');
    return { inserted: true, id: row.id };
  });
}

/**
 * Has a target had any of the given event types? Useful for "already actioned" check.
 */
export async function hasAnyEvent(targetId: number, eventTypes: EventType[]): Promise<boolean> {
  if (eventTypes.length === 0) return false;
  const placeholders = eventTypes.map((_, i) => `$${i + 2}`).join(', ');
  const res = await query(
    `SELECT 1 FROM event_log WHERE target_id = $1 AND event_type IN (${placeholders}) LIMIT 1`,
    [targetId, ...eventTypes],
  );
  return (res.rowCount ?? 0) > 0;
}
