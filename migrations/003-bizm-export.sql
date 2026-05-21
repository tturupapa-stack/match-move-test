-- 003: 비즈엠 엑셀 발송 전환 (자동 카카오 발송 → 운영자 pull 방식, ADR-012)
-- targets에 발송 상태 추적 컬럼 추가.
ALTER TABLE targets
  ADD COLUMN IF NOT EXISTS notification_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS exported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS export_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_targets_notification_status ON targets(notification_status);
