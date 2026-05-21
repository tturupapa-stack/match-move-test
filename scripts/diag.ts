import { loadEnv } from '../server/src/env.js';
import { createPlabClient } from '../server/src/lib/plab-api-client.js';

async function main(): Promise<void> {
  const plab = createPlabClient(loadEnv());

  // 1) DB 타임존: NOW() vs UTC_TIMESTAMP() 차이로 판별
  const tz = await plab.executeSql(
    `SELECT NOW() db_now, UTC_TIMESTAMP() db_utc, @@session.time_zone sz`,
  );
  console.log('=== DB 시간 ===', JSON.stringify(tz.rows[0]));

  // 2) 최근 release 매치 schedule 샘플 (실제 저장 형식 확인)
  const sample = await plab.executeSql(
    `SELECT id, schedule FROM \`match\` WHERE status='release' ORDER BY schedule DESC LIMIT 5`,
  );
  console.log('=== 최근 매치 schedule 샘플 ===');
  for (const r of sample.rows as Array<Record<string, unknown>>) {
    console.log(`id=${r.id} schedule=${r.schedule}`);
  }

  // 3) 5/21 시각별 release 매치 수 (정시 m=0 표시)
  const dist = await plab.executeSql(
    `SELECT HOUR(schedule) h, MINUTE(schedule) m, COUNT(*) c
       FROM \`match\` WHERE DATE(schedule)='2026-05-21' AND status='release'
      GROUP BY HOUR(schedule), MINUTE(schedule) ORDER BY h, m`,
  );
  console.log('=== 5/21 시각별 release 매치 ===');
  for (const r of dist.rows as Array<Record<string, unknown>>) {
    console.log(`${String(r.h).padStart(2, '0')}:${String(r.m).padStart(2, '0')} → ${r.c}건`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
