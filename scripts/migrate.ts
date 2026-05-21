// Run all SQL migrations in lexical order against DATABASE_URL.
// Usage: tsx scripts/migrate.ts
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .env override 로드 (셸 환경 오염 무시). scripts/ 기준 ../.env = 프로젝트 루트.
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });
const migrationsDir = path.resolve(__dirname, '../migrations');

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const f of files) {
      const sql = await readFile(path.join(migrationsDir, f), 'utf8');
      console.log(`[migrate] applying ${f}`);
      await client.query(sql);
    }
    console.log(`[migrate] done — ${files.length} files applied`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
