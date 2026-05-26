import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler, notFound } from './middleware/error.js';
import { adminConfigRouter } from './routes/admin-config.js';
import { adminExportRouter } from './routes/admin-export.js';
import { adminFunnelRouter } from './routes/admin-funnel.js';
import { adminStatsRouter } from './routes/admin-stats.js';
import { healthRouter } from './routes/health.js';
import { matchMoveRouter } from './routes/match-move.js';
import { slackWebhookRouter } from './routes/slack-webhook.js';
import { surveyRouter } from './routes/survey.js';
import { adminSurveyRouter } from './routes/admin-survey.js';

export function createApp(): Express {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS for local dev (web at :3000 → server at :4000)
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  // Slack route consumes raw body — register BEFORE json parser.
  app.use('/api/slack', slackWebhookRouter);

  app.use(express.json({ limit: '100kb' }));

  app.use(healthRouter);
  app.use('/api/match-move', matchMoveRouter);
  app.use('/api/match-move', surveyRouter);
  app.use('/api/admin', adminConfigRouter);
  app.use('/api/admin', adminExportRouter);
  app.use('/api/admin', adminFunnelRouter);
  app.use('/api/admin', adminStatsRouter);
  app.use('/api/admin', adminSurveyRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
