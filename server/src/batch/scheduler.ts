import cron from 'node-cron';
import { runCollectResults } from './collect-results.js';
import { runExtractTargets } from './extract-targets.js';
import { log } from '../lib/logger.js';

export function startSchedulers(): void {
  // F-2: 매시 정각 (0-23시 KST, 전체 시간 모드). 매시 정각에 +3h 후 매치 추출.
  cron.schedule(
    '0 * * * *',
    async () => {
      try {
        await runExtractTargets();
      } catch (err) {
        log.error('extract-targets cron failed', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    },
    {
      timezone: 'Asia/Seoul',
      noOverlap: true,
      name: 'extract-targets',
    },
  );

  // F-7: 매 5분마다 매치 결과 수집 (cheap; internally filters by extracted_at + 3h).
  cron.schedule(
    '*/5 * * * *',
    async () => {
      try {
        await runCollectResults();
      } catch (err) {
        log.error('collect-results cron failed', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    },
    {
      timezone: 'Asia/Seoul',
      noOverlap: true,
      name: 'collect-results',
    },
  );

  log.info('schedulers started', { tz: 'Asia/Seoul' });
}
