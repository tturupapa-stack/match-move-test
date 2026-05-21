import { closePool, query } from '../server/src/lib/db.js';

async function main(): Promise<void> {
  const t = await query<{ id: number }>(
    `SELECT id FROM targets WHERE current_match_info->>'scheduleKst' = '2026-05-21 22:00'`,
  );
  const ids = t.rows.map((r) => r.id);
  console.log('삭제 대상(22:00) ids:', ids);
  if (ids.length > 0) {
    await query(`DELETE FROM event_log WHERE target_id = ANY($1::bigint[])`, [ids]);
    await query(`DELETE FROM targets WHERE id = ANY($1::bigint[])`, [ids]);
    console.log('삭제 완료:', ids.length, '건');
  }
  await closePool();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
