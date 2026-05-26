-- 005: 매니저 액션(이동요청/유지) 직후 노출하는 후속 설문 응답 저장
-- - action_type: 'select' (이동 요청) | 'keep' (현 매치 유지)
-- - reasons: 선택지(복수 선택 가능) 목록. 액션 유형별로 의미가 다르다.
--     keep 측 :
--       'few_options'           추천된 매치의 선택지가 적어서
--       'location_mismatch'     추천된 매치의 장소 조건이 맞지 않아서
--       'current_match_likely'  기존에 보유하고 있던 매치가 진행될 수 있을 것 같아서
--       'current_match_benefit' 기존 보유하고 있던 매치의 혜택을 받고 싶어서
--       'other'                 기타 (other_text 자유 입력)
--     select 측 :
--       'high_likelihood'       이동 가능한 매치의 진행 가능성이 높아 보여서
--       'location_ok'           장소가 비슷하거나 크게 불편하지 않아서
--       'same_time'             시간이 동일해서
--       'other'                 기타 (other_text 자유 입력)
-- - other_text: 'other' 선택 시 자유 입력
-- - suggestion: Q2 — 관련 기타 제안 사항(자유 입력)
-- 1 target_id 당 1 응답 (UNIQUE). 재제출은 거부한다.

CREATE TABLE IF NOT EXISTS survey_responses (
  id BIGSERIAL PRIMARY KEY,
  target_id BIGINT NOT NULL REFERENCES targets(id),
  action_type VARCHAR(16) NOT NULL, -- 'select' | 'keep'
  reasons TEXT[] NOT NULL DEFAULT '{}',
  other_text TEXT,
  suggestion TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 002와 동일한 패턴: pg_constraint 가드로 멱등화 (재실행 시 fail 방지).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uniq_survey_target'
  ) THEN
    ALTER TABLE survey_responses
      ADD CONSTRAINT uniq_survey_target UNIQUE (target_id);
  END IF;
END$$;
CREATE INDEX IF NOT EXISTS idx_survey_responses_action_type ON survey_responses(action_type);
CREATE INDEX IF NOT EXISTS idx_survey_responses_submitted_at ON survey_responses(submitted_at);
