import cron from 'node-cron';
import { runCollectResults } from './collect-results.js';
import { runExtractTargets } from './extract-targets.js';
import { runMarkNoResponse } from './mark-no-response.js';
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

  // 매 5분마다 마감(매치 시작 1h30m 전) 경과 + 무응답 대상을 '유지(무응답)'로 집계.
  cron.schedule(
    '*/5 * * * *',
    async () => {
      try {
        await runMarkNoResponse();
      } catch (err) {
        log.error('mark-no-response cron failed', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    },
    {
      timezone: 'Asia/Seoul',
      noOverlap: true,
      name: 'mark-no-response',
    },
  );

  log.info('schedulers started', { tz: 'Asia/Seoul' });
}
