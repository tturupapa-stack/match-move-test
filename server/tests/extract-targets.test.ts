import { describe, expect, it, vi } from 'vitest';

// We test the in-memory shape of the recommendation filter logic without DB.
// (Full integration goes through scripts/dry-run-extract.ts with a real DB.)

import { PlabApiClient } from '../src/lib/plab-api-client.js';

function mkFetch(rows: unknown[]) {
  return vi.fn(
    async () => new Response(JSON.stringify({ success: true, data: rows }), { status: 200 }),
  ) as unknown as typeof fetch;
}

describe('extract-targets — Q2 → recommendation shape', () => {
  it('Q2 maps row fields correctly', async () => {
    const fetchImpl = mkFetch([
      {
        match_id: 100,
        schedule: '2026-05-20 19:00:00',
        stadium_id: 1,
        stadium_name: 'Stadium A',
        area_id: 5,
        manager_return: 1,
        test_type: 3,
        participant_count: 8,
      },
    ]);
    const client = new PlabApiClient({
      baseUrl: 'https://example.test/api',
      apiKey: 'k',
      fetchImpl,
      backoffMs: 1,
    });
    const rows = await client.q2FindRecommendations({
      targetSchedule: '2026-05-20 19:00:00',
      areaId: 5,
      highThreshold: 6,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.match_id).toBe(100);
    expect(rows[0]!.manager_return).toBe(1);
    expect(rows[0]!.test_type).toBe(3);
  });
});
