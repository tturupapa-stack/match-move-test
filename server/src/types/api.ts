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
};

export type RecommendedMatch = {
  matchId: number;
  scheduleKst: string;
  stadiumName: string;
  participantCount: number;
  isTransferOrigin: boolean; // manager_return = 1
  isPromotion: boolean; // test_type IN (3,6,7,8,9)
};

// === GET /api/match-move/state ===
export type MatchMoveState =
  | { status: 'ok'; current: CurrentMatch; recommendations: RecommendedMatch[] }
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
export type FunnelReport = {
  range: { from: string; to: string };
  steps: {
    extracted: number;
    exported: number; // 비즈엠 발송 자료로 추출됨 (bizm_exported)
    pageEntered: number;
    changeRequested: number;
    keptExisting: number; // 명시적 '현재 매치 유지' 선택
    noResponse: number; // 마감까지 무응답 (유지로 간주)
    changeCompleted: number;
  };
  derived: {
    changeRequestRate: number;
    completionRate: number;
  };
  costSavings: {
    completedTransferPromotion: number;
    totalEstimatedAmount: number;
  };
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
