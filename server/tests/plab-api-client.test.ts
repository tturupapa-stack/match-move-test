import { describe, expect, it, vi } from 'vitest';
import { PlabApiClient, PlabApiError } from '../src/lib/plab-api-client.js';

function mkFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  return vi.fn(impl) as unknown as typeof fetch;
}

const baseOpts = {
  baseUrl: 'https://example.test/api',
  apiKey: 'test-key',
  backoffMs: 1,
  timeoutMs: 1_000,
};

describe('PlabApiClient', () => {
  it('sends X-API-Key and JSON body to /query', async () => {
    let captured: { url: string; body: string; headers: Record<string, string> } | null = null;
    const f = mkFetch(async (url, init) => {
      captured = {
        url: url as string,
        body: String(init.body),
        headers: init.headers as Record<string, string>,
      };
      return new Response(JSON.stringify({ success: true, data: [{ x: 1 }] }), { status: 200 });
    });
    const c = new PlabApiClient({ ...baseOpts, fetchImpl: f });
    const r = await c.executeSql('SELECT 1', [1]);
    expect(r.rows).toEqual([{ x: 1 }]);
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe('https://example.test/api/query');
    expect(captured!.headers['X-API-Key']).toBe('test-key');
    expect(JSON.parse(captured!.body)).toEqual({ query: 'SELECT 1', params: [1] });
  });

  it('throws immediately on 400 (non-retryable)', async () => {
    let calls = 0;
    const f = mkFetch(async () => {
      calls += 1;
      return new Response('bad sql', { status: 400 });
    });
    const c = new PlabApiClient({ ...baseOpts, fetchImpl: f });
    await expect(c.executeSql('garbage')).rejects.toBeInstanceOf(PlabApiError);
    expect(calls).toBe(1);
  });

  it('throws immediately on 429', async () => {
    let calls = 0;
    const f = mkFetch(async () => {
      calls += 1;
      return new Response('quota', { status: 429 });
    });
    const c = new PlabApiClient({ ...baseOpts, fetchImpl: f });
    await expect(c.executeSql('SELECT 1')).rejects.toBeInstanceOf(PlabApiError);
    expect(calls).toBe(1);
  });

  it('retries on 500 up to maxRetries+1 attempts', async () => {
    let calls = 0;
    const f = mkFetch(async () => {
      calls += 1;
      return new Response('boom', { status: 500 });
    });
    const c = new PlabApiClient({ ...baseOpts, fetchImpl: f, maxRetries: 2 });
    await expect(c.executeSql('SELECT 1')).rejects.toBeInstanceOf(PlabApiError);
    expect(calls).toBe(3);
  });

  it('retries 500 and succeeds on later attempt', async () => {
    let calls = 0;
    const f = mkFetch(async () => {
      calls += 1;
      if (calls < 2) return new Response('boom', { status: 500 });
      return new Response(JSON.stringify({ success: true, data: [{ y: 9 }] }), { status: 200 });
    });
    const c = new PlabApiClient({ ...baseOpts, fetchImpl: f, maxRetries: 3 });
    const r = await c.executeSql('SELECT 1');
    expect(r.rows).toEqual([{ y: 9 }]);
    expect(calls).toBe(2);
  });

  it('q4 with empty list returns empty without calling fetch', async () => {
    const f = mkFetch(async () => new Response('should not call', { status: 500 }));
    const c = new PlabApiClient({ ...baseOpts, fetchImpl: f });
    const r = await c.q4RefetchMatches([]);
    expect(r).toEqual([]);
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0);
  });

  it('q1 includes backtick-quoted match table and HAVING participant_count < ?', async () => {
    let capturedSql = '';
    const f = mkFetch(async (_url, init) => {
      capturedSql = JSON.parse(String(init.body)).query as string;
      return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
    });
    const c = new PlabApiClient({ ...baseOpts, fetchImpl: f });
    await c.q1ExtractTargetMatches({ targetSchedule: '2026-05-20 19:00:00', lowThreshold: 4 });
    expect(capturedSql).toMatch(/`match`/);
    expect(capturedSql).toMatch(/HAVING\s+participant_count\s*<\s*\?/i);
  });
});
