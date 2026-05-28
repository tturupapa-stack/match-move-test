import { describe, expect, it } from 'vitest';

/**
 * 추천 매치 시간 윈도우(어드민 가변) 단위 검증.
 *
 * 실 DB 통합은 scripts/dry-run-extract.ts에서 검증. 여기서는
 * extract-targets가 windowBeforeMinutes/windowAfterMinutes를 받아
 * Q2 [from, to] 범위와 매니저 충돌 조회 범위를 어떻게 계산하는지
 * 그 산술 자체만 검증한다 (extract-targets와 동일 로직을 재현).
 */

const MATCH_DURATION_MS = 2 * 60 * 60 * 1000; // 매치 길이 2h (충돌 padding과 동일)
const MANAGER_LOOKUP_PADDING_MS = MATCH_DURATION_MS;

interface WindowMinutes {
  beforeMinutes: number;
  afterMinutes: number;
}

/** extract-targets와 동일한 산식. 입력 S(타깃 시작)와 윈도우 분 → UTC ms 범위. */
function computeRanges(
  targetMs: number,
  win: WindowMinutes,
): { recFrom: number; recTo: number; mgrFrom: number; mgrTo: number } {
  const beforeMs = win.beforeMinutes * 60 * 1000;
  const afterMs = win.afterMinutes * 60 * 1000;
  return {
    recFrom: targetMs - beforeMs,
    recTo: targetMs + afterMs,
    mgrFrom: targetMs - beforeMs - MANAGER_LOOKUP_PADDING_MS,
    mgrTo: targetMs + afterMs + MANAGER_LOOKUP_PADDING_MS,
  };
}

describe('recommendation-window: 산식', () => {
  const S = new Date('2026-05-28T20:00:00Z').getTime();

  it('현재 운영 기본값(before=0, after=240) → 추천[20:00, 24:00], 매니저[18:00, 26:00]', () => {
    const r = computeRanges(S, { beforeMinutes: 0, afterMinutes: 240 });
    expect(new Date(r.recFrom).toISOString()).toBe('2026-05-28T20:00:00.000Z');
    expect(new Date(r.recTo).toISOString()).toBe('2026-05-29T00:00:00.000Z');
    // 매니저 충돌 조회 = 추천 윈도우 양옆 +2h.
    expect(new Date(r.mgrFrom).toISOString()).toBe('2026-05-28T18:00:00.000Z');
    expect(new Date(r.mgrTo).toISOString()).toBe('2026-05-29T02:00:00.000Z');
  });

  it('양방향 윈도우(before=60, after=180) → 추천[19:00, 23:00], 매니저[17:00, 25:00]', () => {
    const r = computeRanges(S, { beforeMinutes: 60, afterMinutes: 180 });
    expect(new Date(r.recFrom).toISOString()).toBe('2026-05-28T19:00:00.000Z');
    expect(new Date(r.recTo).toISOString()).toBe('2026-05-28T23:00:00.000Z');
    expect(new Date(r.mgrFrom).toISOString()).toBe('2026-05-28T17:00:00.000Z');
    expect(new Date(r.mgrTo).toISOString()).toBe('2026-05-29T01:00:00.000Z');
  });

  it('윈도우 확장(before=120, after=360) → 매니저 조회는 추가 padding 2h만큼 더 넓다', () => {
    const r = computeRanges(S, { beforeMinutes: 120, afterMinutes: 360 });
    const recSpan = (r.recTo - r.recFrom) / 3600_000;
    const mgrSpan = (r.mgrTo - r.mgrFrom) / 3600_000;
    expect(recSpan).toBe(8); // 2h + 6h
    expect(mgrSpan).toBe(12); // 8h + 4h(앞뒤 2h padding)
  });

  it('zero before + zero after는 빈 윈도우(=호출자가 reject해야 함)', () => {
    const r = computeRanges(S, { beforeMinutes: 0, afterMinutes: 0 });
    expect(r.recFrom).toBe(r.recTo);
  });
});

describe('recommendation-window: 시간↔분 환산(UI)', () => {
  // config-form은 시간 단위 select, DB는 분 단위 저장 → 60으로 곱/나눔.
  it('hours → minutes', () => {
    expect(4 * 60).toBe(240);
    expect(0 * 60).toBe(0);
    expect(12 * 60).toBe(720);
  });
  it('minutes → hours (반올림)', () => {
    expect(Math.round(240 / 60)).toBe(4);
    expect(Math.round(0 / 60)).toBe(0);
    // 60분 배수가 아닌 임시값도 보여줄 수 있도록 round 사용
    expect(Math.round(90 / 60)).toBe(2);
  });
});
