// 추천 매치 시간 윈도우 설정 — recommendation_window_config 최신 행이 현재값(append-only).
// extract-targets는 대상 매치 시작 시각 S 기준 [S - beforeMinutes, S + afterMinutes]
// 범위의 매치를 추천 후보로 잡는다.
import { query } from './db.js';

export interface RecommendationWindowConfig {
  /** 윈도우 시작 = S - beforeMinutes (0이면 S부터). */
  beforeMinutes: number;
  /** 윈도우 끝 = S + afterMinutes. */
  afterMinutes: number;
}

// seed가 없을 때의 안전 기본값: 현재 운영 동작과 동일(after=4h).
const DEFAULT_WINDOW: RecommendationWindowConfig = {
  beforeMinutes: 0,
  afterMinutes: 240,
};

/**
 * 현재 추천 윈도우 설정을 읽는다. 행이 없으면 DEFAULT_WINDOW.
 */
export async function loadRecommendationWindow(): Promise<RecommendationWindowConfig> {
  const res = await query<{ before_minutes: number; after_minutes: number }>(
    `SELECT before_minutes, after_minutes
       FROM recommendation_window_config ORDER BY id DESC LIMIT 1`,
  );
  const row = res.rows[0];
  if (!row) return DEFAULT_WINDOW;
  return { beforeMinutes: row.before_minutes, afterMinutes: row.after_minutes };
}
