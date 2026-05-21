import { describe, expect, it, vi } from 'vitest';
import { WebhookSlackClient } from '../src/lib/slack-client.js';

function mkFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  return vi.fn(impl) as unknown as typeof fetch;
}

describe('WebhookSlackClient.postExtractSummary', () => {
  it('posts summary text with counts and export url', async () => {
    let body: { channel?: string; text?: string } | null = null;
    const f = mkFetch(async (_url, init) => {
      body = JSON.parse(String(init.body));
      return new Response('ok', { status: 200 });
    });
    const c = new WebhookSlackClient({
      webhookUrl: 'https://hooks.test/x',
      channel: '#match-move-test',
      fetchImpl: f,
    });
    await c.postExtractSummary({
      targetSchedule: '2026-05-21 19:00:00',
      inserted: 3,
      rawCandidates: 10,
      exportUrl: 'https://app.test/admin/export',
    });
    expect(body).not.toBeNull();
    expect(body!.text).toContain('대상자 추출');
    expect(body!.text).toContain('3건');
    expect(body!.text).toContain('검토 후보 10건');
    expect(body!.text).toContain('https://app.test/admin/export');
  });

  it('dry-run (no webhook) does not call fetch', async () => {
    const f = mkFetch(async () => new Response('should not call', { status: 500 }));
    const c = new WebhookSlackClient({ webhookUrl: '', channel: '#c', fetchImpl: f });
    await c.postExtractSummary({ targetSchedule: 'x', inserted: 1, rawCandidates: 1, exportUrl: 'u' });
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0);
  });
});
