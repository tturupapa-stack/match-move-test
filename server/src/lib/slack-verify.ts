import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify the Slack signing-secret signature on an incoming Events API webhook.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(args: {
  signingSecret: string;
  timestamp: string;       // X-Slack-Request-Timestamp header (epoch seconds)
  signature: string;       // X-Slack-Signature header (e.g. 'v0=abc...')
  rawBody: string;
  /** Max acceptable age in seconds. Default 5 minutes. */
  maxAgeSeconds?: number;
  /** Override the current time (testing). */
  now?: number;            // epoch seconds
}): boolean {
  if (!args.signingSecret) return false;
  const tsNum = Number(args.timestamp);
  if (!Number.isFinite(tsNum)) return false;
  const now = args.now ?? Math.floor(Date.now() / 1000);
  const maxAge = args.maxAgeSeconds ?? 300;
  if (Math.abs(now - tsNum) > maxAge) return false;

  const base = `v0:${args.timestamp}:${args.rawBody}`;
  const expected = `v0=${createHmac('sha256', args.signingSecret).update(base).digest('hex')}`;

  const a = Buffer.from(expected);
  const b = Buffer.from(args.signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
