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
      afterRecommendationFilter: 3,
      exportUrl: 'https://app.test/admin/export',
    });
    expect(body).not.toBeNull();
    expect(body!.text).toContain('대상자 추출');
    expect(body!.text).toContain('3건');
    expect(body!.text).toContain('Q1 후보 10건');
    expect(body!.text).toContain('https://app.test/admin/export');
  });

  it('posts "no target" message when inserted=0', async () => {
    let body: { text?: string } | null = null;
    const f = mkFetch(async (_url, init) => {
      body = JSON.parse(String(init.body));
      return new Response('ok', { status: 200 });
    });
    const c = new WebhookSlackClient({ webhookUrl: 'https://hooks.test/x', channel: '#c', fetchImpl: f });
    await c.postExtractSummary({
      targetSchedule: '2026-05-21 19:00:00',
      inserted: 0,
      rawCandidates: 21,
      afterRecommendationFilter: 0,
      exportUrl: 'https://app.test/admin/export',
    });
    expect(body!.text).toContain('발송 대상 없음');
    expect(body!.text).toContain('Q1 후보 21건');
    expect(body!.text).toContain('추천 매치 있는 대상 0건');
  });

  it('dry-run (no webhook) does not call fetch', async () => {
    const f = mkFetch(async () => new Response('should not call', { status: 500 }));
    const c = new WebhookSlackClient({ webhookUrl: '', channel: '#c', fetchImpl: f });
    await c.postExtractSummary({
      targetSchedule: 'x',
      inserted: 1,
      rawCandidates: 1,
      afterRecommendationFilter: 1,
      exportUrl: 'u',
    });
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0);
  });
});
