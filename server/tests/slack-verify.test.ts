import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifySlackSignature } from '../src/lib/slack-verify.js';

function sign(secret: string, ts: string, body: string): string {
  return `v0=${createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex')}`;
}

describe('verifySlackSignature', () => {
  const secret = 'test-secret';
  const body = '{"hello":"world"}';
  const ts = '1700000000';

  it('passes with a correct signature', () => {
    const sig = sign(secret, ts, body);
    expect(
      verifySlackSignature({
        signingSecret: secret,
        timestamp: ts,
        signature: sig,
        rawBody: body,
        now: Number(ts),
      }),
    ).toBe(true);
  });

  it('fails with wrong secret', () => {
    const sig = sign('other', ts, body);
    expect(
      verifySlackSignature({
        signingSecret: secret,
        timestamp: ts,
        signature: sig,
        rawBody: body,
        now: Number(ts),
      }),
    ).toBe(false);
  });

  it('fails when timestamp is too old', () => {
    const sig = sign(secret, ts, body);
    expect(
      verifySlackSignature({
        signingSecret: secret,
        timestamp: ts,
        signature: sig,
        rawBody: body,
        now: Number(ts) + 1000,
        maxAgeSeconds: 300,
      }),
    ).toBe(false);
  });
});
