import { loadEnv } from './env.js';
import { closePool } from './lib/db.js';
import { log } from './lib/logger.js';
import { startSchedulers } from './batch/scheduler.js';
import { createApp } from './server/app.js';

function main(): void {
  const env = loadEnv();
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    log.info('server listening', { port: env.PORT, env: env.NODE_ENV });
  });

  startSchedulers();

  const shutdown = async (signal: string) => {
    log.info('shutdown', { signal });
    server.close(() => log.info('http closed'));
    await closePool().catch((e) => log.error('pool close error', { err: String(e) }));
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main();
