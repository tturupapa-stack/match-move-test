// === Common envelope ===
export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: string; message: string } };
export type ApiResult<T> = ApiOk<T> | ApiErr;

// === Domain primitives ===
export type CurrentMatch = {
  matchId: number;
  scheduleKst: string; // 'YYYY-MM-DD HH:mm'
  stadiumName: string;
  participantCount: number;
  areaId?: number; // 지역구 식별 (plab.area.id). 구버전 데이터엔 없을 수 있음.
  areaName?: string | null; // 지역구 이름 (plab.area.name)
  grade?: number | null; // 매치 등급 (plab.match.grade). NULL=미분류. 구버전 데이터엔 없을 수 있음.
};

export type RecommendedMatch = {
  matchId: number;
  scheduleKst: string;
  stadiumName: string;
  participantCount: number;
  isTransferOrigin: boolean; // manager_return = 1
  isPromotion: boolean; // test_type IN (3,6,7,8,9)
  grade?: number | null; // 매치 등급 (plab.match.grade). NULL=미분류.
};

// 매니저(추천 페이지)에게 노출되는 추천 매치 — 양도/프로모션 여부는 숨긴다 (관리자 전용 정보).
export type RecommendedMatchPublic = Omit<RecommendedMatch, 'isTransferOrigin' | 'isPromotion'>;

// === GET /api/match-move/state ===
export type MatchMoveState =
  | { status: 'ok'; current: CurrentMatch; recommendations: RecommendedMatchPublic[] }
  | { status: 'no_recommendations'; current: CurrentMatch }
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
export type FunnelReport = {
  range: { from: string; to: string };
  steps: FunnelSteps;
  derived: FunnelDerived;
  costSavings: {
    completedTransferPromotion: number;
    totalEstimatedAmount: number;
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
  dryRun?: boolean;
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
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
