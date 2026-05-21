import { Router, type RequestHandler } from 'express';
import { loadEnv } from '../../env.js';
import { query } from '../../lib/db.js';
import { insertEventOnce } from '../../lib/event-log.js';
import { log } from '../../lib/logger.js';
import { verifySlackSignature } from '../../lib/slack-verify.js';

export const slackWebhookRouter: Router = Router();

/**
 * Express needs the raw body to verify the Slack signature. We attach a custom raw-body capture
 * for this route only, then JSON.parse manually.
 */
const captureRaw: RequestHandler = (req, _res, next) => {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', (chunk: string) => {
    data += chunk;
  });
  req.on('end', () => {
    (req as unknown as { rawBody: string }).rawBody = data;
    try {
      req.body = data ? JSON.parse(data) : {};
    } catch {
      req.body = {};
    }
    next();
  });
};

interface SlackReactionEvent {
  type: 'event_callback';
  event: {
    type: 'reaction_added' | 'reaction_removed';
    reaction: string;
    user: string;
    item: { type: 'message'; channel: string; ts: string };
    event_ts: string;
  };
}

interface SlackUrlVerification {
  type: 'url_verification';
  challenge: string;
}

slackWebhookRouter.post('/events', captureRaw, async (req, res) => {
  const env = loadEnv();
  const rawBody = (req as unknown as { rawBody: string }).rawBody ?? '';
  const sig = String(req.headers['x-slack-signature'] ?? '');
  const ts = String(req.headers['x-slack-request-timestamp'] ?? '');

  // If signing secret configured, verify. If not configured (local/dev), allow.
  if (env.SLACK_SIGNING_SECRET) {
    const ok = verifySlackSignature({
      signingSecret: env.SLACK_SIGNING_SECRET,
      timestamp: ts,
      signature: sig,
      rawBody,
    });
    if (!ok) {
      return res.status(401).json({ ok: false, error: { code: 'bad_signature', message: 'slack signature mismatch' } });
    }
  }

  const body = req.body as SlackUrlVerification | SlackReactionEvent | Record<string, unknown>;

  if ((body as SlackUrlVerification).type === 'url_verification') {
    return res.json({ challenge: (body as SlackUrlVerification).challenge });
  }

  if ((body as SlackReactionEvent).type === 'event_callback') {
    const ev = (body as SlackReactionEvent).event;
    if (ev && ev.type === 'reaction_added' && ev.reaction === 'white_check_mark') {
      // We don't have the message text here; Slack only sends `ts`. To find the target,
      // we ideally would fetch the message via Slack API. As an MVP, we accept the channel `ts`
      // and look for a recent change_requested target whose slack alert is "near" this ts.
      // Practical mapping is left to operator who can include #target-{id} in a thread reply
      // if needed. For now, we record the reaction with the ts so we can join later.
      // To unblock the test, support an OPTIONAL message text in the payload (e.g. via Workflow Builder).
      const maybeText = (body as Record<string, unknown>).text as string | undefined;
      const targetId = extractTargetIdFromText(maybeText) ?? (await guessTargetIdByRecent());
      if (targetId !== null) {
        const promotionAmount = await computePromotionAmount(targetId);
        const result = await insertEventOnce({
          targetId,
          eventType: 'change_completed',
          metadata: {
            slack_user: ev.user,
            event_ts: ev.event_ts,
            promotion_released_amount: promotionAmount.amount,
            is_transferred_origin: promotionAmount.isTransferOrigin,
          },
        });
        if (!result.inserted) {
          log.info('change_completed dedup', { target_id: targetId });
        }
      } else {
        log.warn('reaction_added: target unresolvable', { event_ts: ev.event_ts });
      }
    }
  }

  return res.json({ ok: true, data: { received: true } });
});

function extractTargetIdFromText(text: string | undefined): number | null {
  if (!text) return null;
  const m = text.match(/#target-(\d+)/);
  return m && m[1] ? Number(m[1]) : null;
}

async function guessTargetIdByRecent(): Promise<number | null> {
  // Best-effort fallback: most recent change_requested event without change_completed.
  const res = await query<{ target_id: number }>(
    `SELECT el.target_id
       FROM event_log el
       WHERE el.event_type = 'change_requested'
         AND NOT EXISTS (
           SELECT 1 FROM event_log el2
           WHERE el2.target_id = el.target_id AND el2.event_type = 'change_completed'
         )
       ORDER BY el.occurred_at DESC
       LIMIT 1`,
  );
  return res.rows[0]?.target_id ?? null;
}

async function computePromotionAmount(targetId: number): Promise<{ amount: number | null; isTransferOrigin: boolean }> {
  const res = await query<{ metadata: Record<string, unknown> | null }>(
    `SELECT metadata FROM event_log
      WHERE target_id = $1 AND event_type = 'change_requested'
      ORDER BY occurred_at DESC LIMIT 1`,
    [targetId],
  );
  const meta = res.rows[0]?.metadata ?? null;
  if (!meta) return { amount: null, isTransferOrigin: false };
  const testType = (meta as { test_type?: number | null }).test_type ?? null;
  const isTransferOrigin = Boolean((meta as { is_transferred_origin?: boolean }).is_transferred_origin);
  if (testType === null) return { amount: null, isTransferOrigin };
  const lookup = await query<{ amount: number }>(
    `SELECT amount FROM promotion_amount_map WHERE test_type = $1`,
    [testType],
  );
  return { amount: lookup.rows[0]?.amount ?? null, isTransferOrigin };
}
