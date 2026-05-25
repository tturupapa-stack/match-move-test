/**
 * PLAB은 '매니저 미배정' 상태를 NULL이 아니라 더미 매니저 id로 표현한다.
 * - Q1(이동 대상): 이 id는 실제 매니저가 아니므로 대상에서 제외.
 * - Q2/Q4(추천 목적지): 이 id는 미배정(=이동 가능한 빈 매치)이므로 추천 후보에 포함.
 */
export const UNASSIGNED_MANAGER_ID = 102;

/**
 * 운영진(테스트/관리 용도) 매니저 ID 목록.
 * - Q1(이동 대상): 실제 매니저가 아니므로 추출 대상에서 제외.
 * - Q2/Q4(추천 목적지): 운영진은 NULL/102/return=1 조건 어디에도 해당하지 않아 자연스럽게 후보에서 빠짐 — 별도 처리 불필요.
 */
export const OPERATOR_MANAGER_IDS: readonly number[] = [12782];

/** Q1 제외 대상(미배정 더미 + 운영진) — SQL NOT IN 절에 사용. */
export const EXTRACTION_EXCLUDED_MANAGER_IDS: readonly number[] = [
  UNASSIGNED_MANAGER_ID,
  ...OPERATOR_MANAGER_IDS,
];
