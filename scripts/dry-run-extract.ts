// Dry-run: invoke the extract batch (no message sending — channeltalk copy-paste pull model, ADR-013).
// Requires DATABASE_URL pointed at a migrated DB.
// Usage: tsx scripts/dry-run-extract.ts
import { runExtractTargets } from '../server/src/batch/extract-targets.js';
import { closePool } from '../server/src/lib/db.js';

async function main(): Promise<void> {
  const summary = await runExtractTargets();
  console.log('[dry-run] summary:', JSON.stringify(summary, null, 2));
  await closePool();
}

main().catch((err) => {
  console.error('[dry-run] failed:', err);
  process.exit(1);
});
