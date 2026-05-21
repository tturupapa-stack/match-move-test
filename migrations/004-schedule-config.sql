-- Match Move Test — 배치 운영 시간대 설정 (어드민에서 변경 가능)
-- extract-targets 배치는 매시 정각 발화하되, 실행 시점의 KST 시각이
-- [start_hour, end_hour] 범위 밖이거나 enabled=false면 건너뛴다.
-- test_config와 동일하게 append-only — 최신 행(id DESC LIMIT 1)이 현재 설정.

CREATE TABLE IF NOT EXISTS schedule_config (
  id BIGSERIAL PRIMARY KEY,
  job_name VARCHAR(64) NOT NULL,
  start_hour INT NOT NULL CHECK (start_hour BETWEEN 0 AND 23),
  end_hour INT NOT NULL CHECK (end_hour BETWEEN 0 AND 23),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  changed_by VARCHAR(64),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schedule_config_job ON schedule_config(job_name, id DESC);

-- seed: extract-targets 0~23시 전체(기존 24시간 동작 유지)
INSERT INTO schedule_config (job_name, start_hour, end_hour, enabled, changed_by)
SELECT 'extract-targets', 0, 23, TRUE, 'system'
WHERE NOT EXISTS (SELECT 1 FROM schedule_config WHERE job_name = 'extract-targets');
