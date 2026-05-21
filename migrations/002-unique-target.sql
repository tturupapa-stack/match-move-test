-- ADR-006: 같은 매니저 + 같은 매치 중복 발송 원자적 방지

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uniq_manager_match'
  ) THEN
    ALTER TABLE targets ADD CONSTRAINT uniq_manager_match UNIQUE (manager_id, current_match_id);
  END IF;
END$$;
