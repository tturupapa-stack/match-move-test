-- 006: 추천 매치 시간 윈도우 (어드민에서 조정 가능)
-- extract-targets는 대상 매치 시작 시각 S 기준 [S - before_minutes, S + after_minutes]
-- 범위의 매치를 추천 후보로 잡는다. test_config/schedule_config와 동일하게
-- append-only — 최신 행(id DESC LIMIT 1)이 현재 설정.
--
-- 컬럼은 분(minutes) 단위로 저장하지만, 매치는 정시(MINUTE=0)만 추출되므로
-- 실제 효과는 60분 배수에서만 차이가 난다. 분 단위로 보관해 둔 것은 추후
-- 30분 단위 운영 변경이나 다른 배치에서 재사용 가능성을 열어 두기 위함.

CREATE TABLE IF NOT EXISTS recommendation_window_config (
  id BIGSERIAL PRIMARY KEY,
  before_minutes INT NOT NULL CHECK (before_minutes BETWEEN 0 AND 1440),
  after_minutes INT NOT NULL CHECK (after_minutes BETWEEN 0 AND 1440),
  changed_by VARCHAR(64),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recommendation_window_config_id
  ON recommendation_window_config(id DESC);

-- seed: 현재 동작 유지 — before=0, after=240(=4h).
INSERT INTO recommendation_window_config (before_minutes, after_minutes, changed_by)
SELECT 0, 240, 'system'
WHERE NOT EXISTS (SELECT 1 FROM recommendation_window_config);
