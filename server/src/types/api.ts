// === Common envelope ===
export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: string; message: string } };
export type ApiResult<T> = ApiOk<T> | ApiErr;

// === Domain primitives ===
export type CurrentMatch = {
  matchId: number;
  scheduleKst: string; // 'YYYY-MM-DD HH:mm'
  stadiumName: string; // plab.stadium_group.name (예: '구리 아천 스타디움')
  fieldName?: string | null; // plab.stadium.name = 개별 면 (예: '1구장'). 구버전 데이터엔 없을 수 있음.
  participantCount: number;
  areaId?: number; // 지역구 식별 (plab.area.id). 구버전 데이터엔 없을 수 있음.
  areaName?: string | null; // 지역구 이름 (plab.area.name)
  grade?: number | null; // 매치 등급 (plab.match.grade). NULL=미분류. 구버전 데이터엔 없을 수 있음.
};

export type RecommendedMatch = {
  matchId: number;
  scheduleKst: string;
  stadiumName: string;
  fieldName?: string | null; // plab.stadium.name = 개별 면. 구버전 데이터엔 없을 수 있음.
  participantCount: number;
  isTransferOrigin: boolean; // manager_return = 1
  isPromotion: boolean; // test_type IN (3,6,7,8,9)
  grade?: number | null; // 매치 등급 (plab.match.grade). NULL=미분류.
};

// 매니저(추천 페이지)에게 노출되는 매치 페이로드 —
// 양도/프로모션 여부와 매치 등급(grade)은 관리자 전용이므로 응답에서 제외한다.
export type RecommendedMatchPublic = Omit<RecommendedMatch, 'isTransferOrigin' | 'isPromotion' | 'grade'>;
export type CurrentMatchPublic = Omit<CurrentMatch, 'grade'>;

// === GET /api/match-move/state ===
export type MatchMoveState =
  | { status: 'ok'; current: CurrentMatchPublic; recommendations: RecommendedMatchPublic[] }
  | { status: 'no_recommendations'; current: CurrentMatchPublic }
  | { status: 'already_actioned' }
  | { status: 'deadline_passed' }
  | { status: 'invalid_token' };

// === POST /api/match-move/action ===
export type MatchMoveActionBody =
  | { token: string; action: 'select'; selectedMatchId: number }
  | { token: string; action: 'keep' };

export type MatchMoveActionResult =
  | { status: 'accepted' }
  | { status: 'already_actioned' }
  | { status: 'deadline_passed' }
  | { status: 'invalid_token' }
  | { status: 'invalid_selection' }
  | { status: 'match_closed' }; // 요청 직전 다른 매니저가 가져가 미정/양도 상태가 아님

// === Admin config ===
export type AdminConfig = {
  current: { lowThreshold: number; highThreshold: number };
  history: Array<{
    lowThreshold: number;
    highThreshold: number;
    changedBy: string | null;
    changedAt: string; // ISO8601
  }>;
};
export type AdminConfigUpdateBody = {
  lowThreshold: number;
  highThreshold: number;
  changedBy?: string;
};

// === Admin schedule (extract-targets 운영 시간대) ===
// 매시 정각 발화 중 startHour~endHour(KST, 양끝 포함)에만 추출.
// startHour > endHour면 자정 넘김(예: 22~6). enabled=false면 추출 중지.
export type AdminSchedule = {
  current: { startHour: number; endHour: number; enabled: boolean };
  history: Array<{
    startHour: number;
    endHour: number;
    enabled: boolean;
    changedBy: string | null;
    changedAt: string; // ISO8601
  }>;
};
export type AdminScheduleUpdateBody = {
  startHour: number;
  endHour: number;
  enabled: boolean;
  changedBy?: string;
};

// === Admin recommendation window (추천 매치 시간 윈도우) ===
// 대상 매치 시작 시각 S 기준 [S - beforeMinutes, S + afterMinutes] 범위의 매치를
// 추천 후보로 잡는다. test_config / schedule_config와 동일하게 append-only —
// 최신 행이 현재 설정. seed: before=0, after=240(=4h).
export type AdminRecommendationWindow = {
  current: { beforeMinutes: number; afterMinutes: number };
  history: Array<{
    beforeMinutes: number;
    afterMinutes: number;
    changedBy: string | null;
    changedAt: string; // ISO8601
  }>;
};
export type AdminRecommendationWindowUpdateBody = {
  beforeMinutes: number;
  afterMinutes: number;
  changedBy?: string;
};

// === Promotion map ===
export type PromotionMapEntry = {
  testType: number;
  amount: number;
  updatedBy: string | null;
  updatedAt: string;
};
export type PromotionMap = PromotionMapEntry[];
export type PromotionMapUpdateBody = {
  entries: Array<{ testType: number; amount: number }>;
  updatedBy?: string;
};

// === Funnel ===
export type ReportBucket = 'day' | 'week';
export type FunnelSteps = {
  extracted: number;
  exported: number; // 비즈엠 발송 자료로 추출됨 (bizm_exported)
  pageEntered: number;
  changeRequested: number;
  keptExisting: number; // 명시적 '현재 매치 유지' 선택
  noResponse: number; // 마감까지 무응답 (유지로 간주)
  changeCompleted: number;
};
export type FunnelDerived = {
  changeRequestRate: number;
  completionRate: number;
};
// 시계열 1행. bucketStart는 'YYYY-MM-DD' (KST 기준; week는 ISO 월요일).
export type FunnelBucketRow = {
  bucketStart: string;
  steps: FunnelSteps;
  derived: FunnelDerived;
};
// 비용 절감 집계 단계별 누락 진단. 운영자가 '왜 0건/적게 잡혔는지' 즉시 식별 가능.
export type FunnelCostBreakdown = {
  completedTotal: number; // 기간 내 change_completed 총건
  completedWithTransfer: number; // 그중 is_transferred_origin=true
  completedWithAmount: number; // is_transferred_origin=true AND promotion_released_amount IS NOT NULL  (=최종 카운트)
  // 양도였으나 금액 매핑이 비어 카운트에서 빠진 건 (즉 completedWithTransfer - completedWithAmount).
  // 원인을 한 단계 더 세분화 (test_type 자체가 NULL / map에 행 없음).
  missingAmount: {
    noTestType: number; // change_requested.test_type이 NULL인 케이스
    noMapping: number; // test_type은 있는데 promotion_amount_map에 매핑 없음
  };
};
export type FunnelReport = {
  range: { from: string; to: string };
  steps: FunnelSteps;
  derived: FunnelDerived;
  costSavings: {
    completedTransferPromotion: number;
    totalEstimatedAmount: number;
    breakdown: FunnelCostBreakdown;
  };
  // 시계열 — bucket 쿼리 파라미터가 있을 때만 채워진다 (없으면 undefined).
  bucket?: ReportBucket;
  series?: FunnelBucketRow[];
};

// === GET /api/admin/stats — 추출 통계 (extracted 이벤트 누적 집계) ===
// 시계열 1행. bucketStart는 'YYYY-MM-DD' (KST 기준; week는 ISO 월요일).
export type StatsBucketRow = {
  bucketStart: string;
  targets: number; // 해당 구간 추출 대상 수
  avgRecommended: number; // 해당 구간 평균 추천 매치 수 (recommended_count 평균)
};
// 등급 1행. grade=null은 PLAB match.grade가 NULL인 케이스 (UI에선 '미분류').
export type StatsGradeRow = { grade: number | null; count: number };
export type StatsReport = {
  range: { from: string; to: string };
  recommended: {
    targets: number; // 기간 내 추출된 대상 수 (extracted 이벤트)
    avg: number; // 대상당 평균 추천 매치 수
    // 추천 매치 N개를 받은 대상이 몇 건인지 (오름차순)
    distribution: Array<{ count: number; targets: number }>;
  };
  // 현재 매치가 속한 지역구별 대상 수 (내림차순). areaName 미상은 '(미상)'.
  areas: Array<{ areaId: number | null; areaName: string; targets: number }>;
  // 등급 분포 — current는 추출된 대상자의 현재 매치 등급, recommended는 추천된 매치 등급
  // 모두 등급 오름차순(NULL은 마지막).
  // 구버전 extracted 이벤트엔 등급 metadata가 없어 빈 배열일 수 있다.
  grades: {
    current: StatsGradeRow[];
    recommended: StatsGradeRow[];
  };
  // 시계열 — bucket 쿼리 파라미터가 있을 때만 채워진다.
  bucket?: ReportBucket;
  series?: StatsBucketRow[];
};

// === GET /api/admin/export/history — 발송 완료/대상 제외 개별 이력 ===
// 대상의 진행 단계(토글 상세에서 타임라인으로 표시).
export type ExportHistoryTimelineStep = {
  eventType: EventType;
  occurredKst: string; // 'YYYY-MM-DD HH:mm' (KST)
};
export type ExportHistoryItem = {
  id: number; // event_log.id
  status: 'exported' | 'excluded'; // bizm_exported | bizm_excluded
  occurredKst: string; // 처리 시각 'YYYY-MM-DD HH:mm' (KST)
  targetId: number | null;
  managerName: string | null;
  matchTime: string | null; // 현재 매치 시각 (current_match_info.scheduleKst)
  stadiumName: string | null;
  fieldName: string | null; // 현재 매치 면 (구버전 대상은 null)
  currentGrade: number | null; // 현재 매치 등급 (구버전 대상은 null)
  operator: string | null; // 처리자 (marked_by | excluded_by)
  // ── 토글 상세 ──
  participantCount: number | null; // 현재 매치 참가자 수
  exportCount: number | null; // 누적 발송 횟수
  notificationStatus: string | null; // 대상의 현재 상태 (pending/exported/excluded)
  recommended: RecommendedMatch[]; // 발송 당시 추천받은 매치 (관리자 전용: 양도/프로모션 포함)
  timeline: ExportHistoryTimelineStep[]; // 대상의 이벤트 진행 (시간순)
};
export type ExportHistoryReport = {
  range: { from: string; to: string };
  exportedCount: number; // 기간 내 발송 완료 총 건수
  excludedCount: number; // 기간 내 대상 제외 총 건수
  items: ExportHistoryItem[]; // 최신순 (limit 적용 가능)
};

// === Manual extract (수동 추출 테스트) ===
export type ExtractPreviewItem = {
  managerName: string | null;
  current: CurrentMatch;
  recommendedCount: number;
};
export type ManualExtractResult = {
  targetSchedule: string;
  lowThreshold: number;
  highThreshold: number;
  /** 적용된 추천 윈도우(분) — DB 설정 또는 호출 시 override된 값. */
  windowBeforeMinutes: number;
  windowAfterMinutes: number;
  dryRun: boolean;
  rawCandidates: number;
  afterDedup: number;
  afterRecommendationFilter: number;
  inserted: number;
  preview: ExtractPreviewItem[];
};
export type ManualExtractBody = {
  targetSchedule?: string; // 'YYYY-MM-DD HH:00:00' KST
  lowThreshold?: number;
  highThreshold?: number;
  /** 임시 추천 윈도우(분). 둘 다 같이 보내야 적용. */
  windowBeforeMinutes?: number;
  windowAfterMinutes?: number;
  dryRun?: boolean;
};

// === Survey (액션 직후 후속 설문 — F-9) ===
// 액션 유형별 선택지(복수 선택 가능). reasons 배열에 코드값을 담는다.
// 'other' 선택 시 otherText 자유 입력.
export type SurveyActionType = 'select' | 'keep';
export const SURVEY_KEEP_REASONS = [
  'few_options', // 추천된 매치의 선택지가 적어서
  'location_mismatch', // 추천된 매치의 장소 조건이 맞지 않아서
  'current_match_likely', // 기존 매치가 진행될 수 있을 것 같아서
  'current_match_benefit', // 기존 매치의 혜택을 받고 싶어서
  'other',
] as const;
export type SurveyKeepReason = (typeof SURVEY_KEEP_REASONS)[number];
export const SURVEY_SELECT_REASONS = [
  'high_likelihood', // 이동 매치의 진행 가능성이 높아 보여서
  'location_ok', // 장소가 비슷하거나 크게 불편하지 않아서
  'same_time', // 시간이 동일해서
  'other',
] as const;
export type SurveySelectReason = (typeof SURVEY_SELECT_REASONS)[number];

export type SurveySubmitBody = {
  token: string;
  actionType: SurveyActionType;
  reasons: string[]; // 액션 유형에 맞는 코드값들
  otherText?: string; // 'other' 포함 시 자유 입력
  suggestion?: string; // Q2 자유 의견
};

export type SurveySubmitResult =
  | { status: 'accepted' }
  | { status: 'already_submitted' }
  | { status: 'action_mismatch' } // 토큰의 대상자가 해당 actionType 액션을 하지 않음
  | { status: 'no_action_yet' } // 아직 select/keep 액션 자체가 없음 → 설문 노출 자체가 잘못된 흐름
  | { status: 'invalid_token' }
  | { status: 'invalid_body' };

// === GET /api/admin/surveys — 어드민 설문 응답 집계 ===
export type SurveyReasonBreakdown = {
  reason: string; // 코드값 (예: 'few_options'). 'other' 포함
  count: number;
};
export type SurveyResponseItem = {
  id: number;
  targetId: number;
  managerName: string | null;
  actionType: SurveyActionType;
  reasons: string[];
  otherText: string | null;
  suggestion: string | null;
  submittedKst: string; // 'YYYY-MM-DD HH:mm'
  // 응답 당시 매니저 컨텍스트 (어드민이 한 줄에서 누가 어떤 매치였는지 보기 위한 단순 스냅샷)
  currentMatchTime: string | null;
  currentStadiumName: string | null;
};
export type SurveyReport = {
  range: { from: string; to: string };
  totals: {
    all: number;
    keep: number; // 유지 액션 + 설문 제출
    select: number; // 이동 요청 + 설문 제출
  };
  // 액션 유형별 사유 분포 (내림차순)
  reasons: {
    keep: SurveyReasonBreakdown[];
    select: SurveyReasonBreakdown[];
  };
  items: SurveyResponseItem[]; // 최신순
};

// === Event types ===
export const EVENT_TYPES = [
  'extracted',
  'bizm_exported', // 운영자가 비즈엠 발송 자료(xlsx)를 다운로드/발송 처리함 (ADR-012)
  'bizm_excluded', // 운영자가 발송 대상에서 수동 제외함 (notification_status='excluded')
  'page_entered',
  'change_requested',
  'kept_existing',
  'no_response', // 마감(매치 시작 1h30m 전)까지 무응답 → 유지로 간주 (배치 mark-no-response)
  'entered_after_deadline',
  'change_completed',
  'match_result',
  'survey_submitted', // 매니저 액션 직후 후속 설문 제출 (F-9)
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
