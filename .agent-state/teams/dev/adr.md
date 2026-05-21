# ADR (Architecture Decision Records) — DEV/L-002 path-name freeze log

| ADR | Date | Decision | Status |
|---|---|---|---|
| ADR-014 | 2026-05-21 | **타임존 정정 (ADR-003 supersede)**: PLAB DB는 `schedule`을 **UTC**로 저장(진단: session time_zone=UTC, NOW()==UTC_TIMESTAMP(), 샘플 schedule이 ISO 'Z'). 기존 `time.ts`가 KST 문자열로 `schedule = ?` 비교 → **9시간 엇갈려** 잘못된 시각의 매치를 추출(예: 19:00 KST 요청 시 0건, 실제는 UTC 10:00에 92건 존재). 수정: DB 비교는 `formatUtcSqlDateTime`(UTC), DB schedule 파싱은 `parseDbSchedule`(UTC), 표시는 `formatKstDisplay`/`formatKstSqlDateTime`(KST). 수동 입력 targetSchedule은 KST로 해석 후 UTC 변환. | accepted |
| ADR-001 | 2026-05-20 | 토큰 만료 60초 마진 (action 시점에) | accepted |
| ADR-002 | 2026-05-20 | 단일 HMAC 시크릿. 회전 정책 없음. | accepted |
| ADR-003 | 2026-05-20 | 모든 타임존 Asia/Seoul. PLAB Q1 schedule은 KST 정시 문자열. | accepted |
| ADR-004 | 2026-05-20 | Kakao 알림톡은 mock 어댑터 + KAKAO_DRY_RUN env. 실 연동 별도 PR. | accepted |
| ADR-005 | 2026-05-20 | 마이그레이션 001에서 test_config seed (4, 6) 자동 삽입. | accepted |
| ADR-006 | 2026-05-20 | targets에 UNIQUE(manager_id, current_match_id). ON CONFLICT DO NOTHING으로 중복 발송 방지. | accepted |
| ADR-007 | 2026-05-20 | npm workspaces 2-패키지(server, web) 구성. | accepted |
| ADR-008 | 2026-05-20 | Slack 이모지 멱등성: change_completed INSERT 시 NOT EXISTS 가드. | accepted |
| ADR-009 | 2026-05-20 | Slack 발신은 Incoming Webhook. 메시지 본문에 `#target-{id}` 식별자 포함. | accepted |
| ADR-010 | 2026-05-20 | Admin 화면 인증 없음 (내부망 가정, 일회용). noindex 메타. | accepted |
| ADR-011 | 2026-05-21 | 매치 시간 필터 전체 시간 확장: Q1에서 `HOUR(m.schedule) BETWEEN 18 AND 23` 조건 제거, F-2 cron `0 15-20 * * *` → `0 * * * *`. `MINUTE(m.schedule) = 0` 정시 제약은 유지. 사유: dry-run 검증 시 PRD 18-23시 제약 때문에 새벽·오전 시간대 매치를 다룰 수 없어 가설 검증 범위 협소. 영향: PLAB API 호출 24회/일(기존 6회/일)로 증가, PRD §3.3 100회 가정 내 여유. | accepted |
| ADR-013 | 2026-05-21 | 발송 방식 재변경: 비즈엠 엑셀 → **채널톡 복붙 메시지(대상자별 복사 카드)**. 사유: 대상자 규모가 작을 것으로 예상되어 대량발송 도구가 과함. `GET /api/admin/export/pending`이 `phone`+`messageText`(본문+추천 URL)를 반환, 발송 관리 화면은 카드별 [번호 복사]/[메시지 복사]/[발송 완료] + [전체 발송 완료] 제공. `POST /export/mark`·`bizm_exported` 이벤트는 데이터 호환 위해 명칭 유지(metadata.channel='channeltalk'). 제거: `bizm-xlsx.ts`·`bizm-xlsx.test.ts`·`server/assets/bizm-template.xlsx`·`exceljs` 의존성·LMS 폴백·`GET /export/bizm.xlsx` 라우트·`message-builder`의 LMS_SUBJECT/BUTTON_NAME. phone은 화면 조회 시점 PLAB 조회·미저장이며 메시지 본문에는 미포함(매니저 비노출). ADR-012를 대체. | accepted |
| ADR-012 | 2026-05-21 | (대체됨 by ADR-013) 발송 방식 변경: 자동 카카오 알림톡 → 비즈엠 대용량 발송 양식(xlsx) 생성 + 운영자 pull(C안). `KakaoClient`/`KAKAO_*` env 폐기. extract-targets는 발송 없이 `notification_status='pending'`으로 누적. 운영자가 `GET /api/admin/export/bizm.xlsx`로 양식 다운(phone은 PLAB에서 발송 시점 조회·미저장, PRD §5.2 유지) → 비즈엠 업로드 → `POST /api/admin/export/mark`로 'exported' 전환 + `bizm_exported` 이벤트. LMS 폴백 포함(AP/AQ/AR). 양식은 원본 템플릿(server/assets/bizm-template.xlsx) 복사 후 데이터 행만 채움(서식 보존). funnel 'message_sent'→'bizm_exported'. 사유: 일회용 단순화·발송 검수·PLAB 알림톡 인프라 의존 제거. | accepted |

## Frozen identifiers (DEV/L-002)

다음 식별자는 Phase 3 동안 변경 금지. 변경 필요 시 본 표에 1줄 추가 + 명시.

### 환경변수 키
DATABASE_URL, PLAB_API_BASE_URL, PLAB_API_KEY, KAKAO_API_BASE_URL, KAKAO_API_KEY, KAKAO_TEMPLATE_ID, KAKAO_DRY_RUN, SLACK_WEBHOOK_URL, SLACK_SIGNING_SECRET, SLACK_CHANNEL, HMAC_SECRET, TZ, NODE_ENV, PORT, PUBLIC_BASE_URL, API_BASE_URL, NEXT_PUBLIC_API_BASE_URL

### Express 라우트
- GET /healthz
- GET /api/match-move/state
- POST /api/match-move/action
- POST /api/slack/events
- GET /api/admin/config
- PUT /api/admin/config
- GET /api/admin/promotion-map
- PUT /api/admin/promotion-map
- GET /api/admin/funnel

### 패키지/디렉토리
- @match-move/server (server/)
- @match-move/web (web/)
- server/src/{lib,batch,server/routes,server/middleware,types}
- web/app/{match-move,admin/config,admin/funnel}
- migrations/001-init.sql, 002-unique-target.sql

### 핵심 타입 (server/src/types/api.ts)
ApiResult, ApiOk, ApiErr, MatchMoveState, CurrentMatch, RecommendedMatch, MatchMoveActionBody, MatchMoveActionResult, AdminConfig, AdminConfigUpdateBody, PromotionMap, PromotionMapUpdateBody, FunnelReport
