import type { ErrorRequestHandler, RequestHandler } from 'express';
import { log } from '../../lib/logger.js';
import type { ApiErr } from '../../types/api.js';

export const notFound: RequestHandler = (_req, res) => {
  const body: ApiErr = { ok: false, error: { code: 'not_found', message: 'route not found' } };
  res.status(404).json(body);
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  log.error('unhandled error', { err: err instanceof Error ? err.message : String(err) });
  const body: ApiErr = {
    ok: false,
    error: {
      code: 'internal_error',
      message: process.env.NODE_ENV === 'production' ? 'internal error' : String(err?.message ?? err),
    },
  };
  res.status(500).json(body);
};
