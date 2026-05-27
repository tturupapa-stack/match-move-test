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
  it('Q2 maps row fields correctly with [from,to] range', async () => {
    let capturedSql = '';
    let capturedParams: unknown[] = [];
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      capturedSql = body.query;
      capturedParams = body.params;
      return new Response(
        JSON.stringify({
          success: true,
          data: [
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
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const client = new PlabApiClient({
      baseUrl: 'https://example.test/api',
      apiKey: 'k',
      fetchImpl: f,
      backoffMs: 1,
    });
    const rows = await client.q2FindRecommendations({
      fromScheduleUtc: '2026-05-20 10:00:00',
      toScheduleUtc: '2026-05-20 14:00:00',
      areaId: 5,
      highThreshold: 6,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.match_id).toBe(100);
    // 시간 윈도우(v1.2): m.schedule >= ? AND m.schedule <= ? + MINUTE=0 정시 필터.
    expect(capturedSql).toMatch(/m\.schedule\s*>=\s*\?/);
    expect(capturedSql).toMatch(/m\.schedule\s*<=\s*\?/);
    expect(capturedSql).toMatch(/MINUTE\(m\.schedule\)\s*=\s*0/);
    expect(capturedParams).toEqual(['2026-05-20 10:00:00', '2026-05-20 14:00:00', 5, 6]);
  });
});

describe('qManagerOtherActiveMatches', () => {
  it('looks up manager\'s release matches excluding the candidate, within range', async () => {
    let capturedSql = '';
    let capturedParams: unknown[] = [];
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      capturedSql = body.query;
      capturedParams = body.params;
      return new Response(
        JSON.stringify({
          success: true,
          data: [{ match_id: 9001, schedule: '2026-05-20 21:00:00', stadium_id: 7 }],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const client = new PlabApiClient({
      baseUrl: 'https://example.test/api',
      apiKey: 'k',
      fetchImpl: f,
      backoffMs: 1,
    });
    const rows = await client.qManagerOtherActiveMatches({
      managerId: 555,
      excludeMatchId: 8000,
      fromScheduleUtc: '2026-05-20 08:00:00',
      toScheduleUtc: '2026-05-20 16:00:00',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.match_id).toBe(9001);
    expect(capturedSql).toMatch(/manager_id\s*=\s*\?/);
    expect(capturedSql).toMatch(/m\.id\s*!=\s*\?/);
    expect(capturedSql).toMatch(/manager_return\s*=\s*0/);
    expect(capturedSql).toMatch(/status\s*=\s*'release'/);
    expect(capturedParams).toEqual([555, 8000, '2026-05-20 08:00:00', '2026-05-20 16:00:00']);
  });
});

describe('extract-targets — interval overlap (manager conflict)', () => {
  // 매치 길이 2h 기준: |M.start - R.start| < 2h ⇒ overlap.
  // 정확히 2h 차이(=연타임)는 경계만 닿음 → 추천 유지.
  const MATCH_DURATION_MS = 2 * 60 * 60 * 1000;
  function overlaps(aIso: string, bIso: string): boolean {
    return (
      Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) < MATCH_DURATION_MS
    );
  }

  it('same start = overlap', () => {
    expect(overlaps('2026-05-20T21:00:00Z', '2026-05-20T21:00:00Z')).toBe(true);
  });
  it('1h apart = overlap', () => {
    expect(overlaps('2026-05-20T21:00:00Z', '2026-05-20T20:00:00Z')).toBe(true);
    expect(overlaps('2026-05-20T21:00:00Z', '2026-05-20T22:00:00Z')).toBe(true);
  });
  it('exactly 2h apart (back-to-back) = NOT overlap (연타임 허용)', () => {
    expect(overlaps('2026-05-20T19:00:00Z', '2026-05-20T21:00:00Z')).toBe(false);
    expect(overlaps('2026-05-20T21:00:00Z', '2026-05-20T23:00:00Z')).toBe(false);
  });
  it('3h apart = NOT overlap', () => {
    expect(overlaps('2026-05-20T19:00:00Z', '2026-05-20T22:00:00Z')).toBe(false);
  });

  // 사용자 시나리오: 매니저가 19시(대상) + 21시 같은 구장 연타임 보유.
  // 윈도우 [S, S+4h] = [19:00, 23:00] → 추천 후보 5개(정시).
  // 매니저 보유 21시와 충돌 검사 결과:
  //  - 19:00 → diff 2h → keep
  //  - 20:00 → diff 1h → exclude
  //  - 21:00 → diff 0  → exclude
  //  - 22:00 → diff 1h → exclude
  //  - 23:00 → diff 2h → keep
  it('user scenario: 19시 대상 + 매니저 21시 연타임 → 19/23시만 추천', () => {
    const candidates = [
      '2026-05-20T19:00:00Z',
      '2026-05-20T20:00:00Z',
      '2026-05-20T21:00:00Z',
      '2026-05-20T22:00:00Z',
      '2026-05-20T23:00:00Z',
    ];
    const managerOther = '2026-05-20T21:00:00Z';
    const survivors = candidates.filter((c) => !overlaps(c, managerOther));
    expect(survivors).toEqual(['2026-05-20T19:00:00Z', '2026-05-20T23:00:00Z']);
  });
});
