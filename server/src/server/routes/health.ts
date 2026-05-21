import { Router } from 'express';

export const healthRouter: Router = Router();

healthRouter.get('/healthz', (_req, res) => {
  res.json({ ok: true, data: { status: 'up', ts: new Date().toISOString() } });
});
