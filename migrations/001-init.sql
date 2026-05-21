-- Match Move Test — 자체 DB 스키마 (PRD §3.1)

CREATE TABLE IF NOT EXISTS test_config (
  id BIGSERIAL PRIMARY KEY,
  low_threshold INT NOT NULL,
  high_threshold INT NOT NULL,
  changed_by VARCHAR(64),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promotion_amount_map (
  test_type INT PRIMARY KEY,
  amount INT NOT NULL,
  updated_by VARCHAR(64),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS targets (
  id BIGSERIAL PRIMARY KEY,
  manager_id INT NOT NULL,
  manager_name VARCHAR(64),
  current_match_id INT NOT NULL,
  current_match_info JSONB NOT NULL,
  recommended_matches JSONB NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  token_expires_at TIMESTAMPTZ NOT NULL,
  extracted_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_targets_manager_match ON targets(manager_id, current_match_id);

CREATE TABLE IF NOT EXISTS event_log (
  id BIGSERIAL PRIMARY KEY,
  target_id BIGINT REFERENCES targets(id),
  event_type VARCHAR(32) NOT NULL,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);
CREATE INDEX IF NOT EXISTS idx_event_log_target ON event_log(target_id);
CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type);

-- ADR-005: seed initial threshold
INSERT INTO test_config (low_threshold, high_threshold, changed_by)
SELECT 4, 6, 'system'
WHERE NOT EXISTS (SELECT 1 FROM test_config);
