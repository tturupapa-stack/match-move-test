# Phase 1: EXPLORE — 매니저 매치 이동 가설 검증 테스트

## 컨텍스트 요약
- PRD: `/Users/larkkim/project_R/PRD-매니저매치이동테스트.md` (일회용 테스트 시스템)
- 기술 스택: Node.js + TypeScript / Express + Next.js / PostgreSQL / pg / node-cron / zod / vitest
- 작업 디렉토리: `/Users/larkkim/project_R` (빈 상태)
- 팀 메모리: 비어 있음 (첫 실행). SOP/learnings 적용 없음.

## Context7 라이브러리 정합성 체크 (use context7)

| 라이브러리 | ID | 핵심 사용 패턴 (검증됨) |
|---|---|---|
| node-cron | `/node-cron/node-cron` | `cron.schedule('0 15-20 * * *', fn, { timezone: 'Asia/Seoul', noOverlap: true })` — `noOverlap`으로 배치 중첩 방지 (배치 5분 이내 SLA에 안전 마진) |
| node-postgres | `/brianc/node-postgres` | `Pool` + `pool.query(text, [$1, $2])` — JSONB 자동 파싱/직렬화 지원 (recommended_matches, current_match_info, metadata 컬럼에 그대로 객체 push) |
| Next.js 15 | `/vercel/next.js/v15.1.8` | App Router. Server Component에서 `searchParams` props로 토큰 수신. Client Component는 `'use client'` 분리. Route Handler `app/api/.../route.ts`로 mutation 처리. |
| zod | (표준 사용) | 환경변수/요청 body 검증. 컴파일 안전성 확보. |
| vitest | (표준 사용) | `describe/it/expect`. `vi.mock`으로 PlabApiClient mock. |
| Express 5 | (표준 사용) | API 서버 분리 운영. JSON body parser, CORS, Helmet. |

**의사결정**: API 서버는 **Express 단독 운영** (port 4000), Next.js는 **UI 전용** (port 3000). Next.js의 API 라우트는 사용하지 않고, 클라이언트가 Express API를 직접 fetch (NEXT_PUBLIC_API_BASE_URL). 이유: (a) 추천 페이지 SSR 시 서버 컴포넌트가 Express API를 호출하기 쉬움, (b) Slack webhook 수신은 Express 라우트가 자연스러움, (c) 일회용 시스템이므로 BFF 레이어 추가 가치 없음.

## 엣지 케이스 / Failure Mode 분석

### 1. 알림톡 발송 실패 (PRD §3.4)
- **시나리오**: PLAB 알림톡 인프라 호출 시 500/타임아웃.
- **결정**: `message_failed` 이벤트 로그만 기록 후 다음 대상자로 진행. **자동 재시도 없음** — 사람 개입(슬랙 알람) 우선. 매시 정각 배치이므로 다음 시간대에 동일 매치는 자연 제외(이미 발송 이력으로 dedup) 되지 않음 — `message_sent` 성공 이력만 dedup 키로 사용. 즉, 실패는 다음 시간대에 재시도되는 효과 있음.
- **멱등성**: dedup 키 = `(manager_id, current_match_id) WHERE event_type IN ('message_sent', 'change_requested', 'kept_existing')`. Q1 추출 후 이 dedup으로 필터.

### 2. Q4 재조회 결과 모두 조건 미달 (PRD §2.5)
- **시나리오**: 페이지 진입 시점에 추천 매치 모두 마감/취소/조건 변화.
- **결정**: UI에 "현재 추천 가능한 매치가 없습니다. 죄송합니다." 표시 + `page_entered` metadata에 `available_count: 0` 기록. 유지 버튼만 표시.

### 3. 토큰 만료 직전 액션
- **시나리오**: 만료 1초 전 진입, 액션 5초 후 → 슬랙 알림은 발송되는데 매치 시작 1시간 28분 전이라 운영자 처리 불가.
- **결정**: action 엔드포인트에서 만료 시각 검사 시 **현재 시각 + 60초 마진** 적용. 60초 이내 만료 예정이면 reject + "변경 가능 시간이 임박했습니다" 표시. (PRD에 없으나 시스템적 안정장치, ADR-001로 기록)

### 4. 중복 발송 방지
- **PRD 명시**: 같은 매니저 + 같은 매치 dedup.
- **구현**: 자체 DB `targets` INSERT 전 `SELECT EXISTS(SELECT 1 FROM event_log el JOIN targets t ON el.target_id=t.id WHERE t.manager_id=$1 AND t.current_match_id=$2 AND el.event_type='message_sent')` 체크. 또는 `targets` 테이블에 `UNIQUE (manager_id, current_match_id)` 제약. **결정**: UNIQUE 제약 + `ON CONFLICT DO NOTHING` (간결, 원자성 보장). PRD 스키마와 차이가 있어 마이그레이션 002에서 추가.

### 5. PLAB SQL Gateway 일시 장애 (429/500)
- **PRD §3.4**: 429 → 슬랙 알람 + 다음 시간대, 500 → 3회 재시도 후 슬랙 알람.
- **구현**: `PlabApiClient`에 exponential backoff (500ms/1s/2s). 400/401은 즉시 throw + 슬랙 알람(배치 중단). 재시도는 GET-like 쿼리(Q1~Q6 모두 멱등)이므로 안전.

### 6. Slack 이모지 수신 webhook 멱등성
- **시나리오**: 운영자가 ✅를 두 번 추가/제거.
- **결정**: `change_completed` 이벤트 INSERT 시 `WHERE NOT EXISTS (... WHERE target_id=$1 AND event_type='change_completed')` 가드. Slack event payload의 `event_ts`도 metadata에 저장하여 추적.

### 7. HMAC 시크릿
- **결정**: 단일 환경변수 `HMAC_SECRET` (테스트 기간 짧음). 회전 정책 없음. ADR-002로 기록.

### 8. 타임존
- **PLAB DB**: PRD에 미명시. `match.schedule`은 `datetime` (timezone 정보 없음). PLAB이 Asia/Seoul 기준이라 가정.
- **자체 DB**: PostgreSQL `TIMESTAMPTZ` 사용 — 내부적으로 UTC 저장. 비교 시 KST로 변환.
- **cron**: `timezone: 'Asia/Seoul'` 명시.
- **Q1 파라미터**: `targetSchedule = now() + 3h`을 KST 기준 정시("YYYY-MM-DD HH:00:00")로 포맷하여 PLAB에 전달. ADR-003.

### 9. Token 구조
- 페이로드: `{ tid: targets.id, exp: ISO8601 }`
- 토큰 = `base64url(JSON) + '.' + base64url(HMAC-SHA256(secret, JSON))`
- 검증: base64url decode → HMAC 비교 (timing-safe) → exp 체크.

### 10. PLAB phone 발송 시점에만 사용 (PRD §5.2)
- **구현**: Q1 결과의 `manager_phone`을 메모리에서만 사용, `targets` INSERT 직전 객체에서 제거. 알림톡 발송 함수 호출 시 인자로만 전달. `current_match_info` JSONB에도 phone 미포함.

## Scope Guard (PRD §4.1 P0)

P0 10개 모듈 — Standard 모드 Sprint 1회로 커버 가능한가?

| 모듈 | BE/FE | 단위 |
|---|---|---|
| T-1 PlabApiClient | BE | 단일 client + 6개 query helper (Q1, Q2, Q4, Q5, Q6, + executeSql 저수준) |
| T-2 DB 스키마 | BE | 마이그레이션 001-init.sql |
| T-3 F-1/F-1B 설정 화면 | FE+BE | BE: GET/PUT `/api/admin/config`. FE: `web/app/admin/config/page.tsx` (서버 컴포넌트로 read, client form으로 mutate) |
| T-4 추출 배치 | BE | `src/batch/extract-targets.ts` + scheduler |
| T-5 알림톡 발송 | BE | `src/lib/kakao-client.ts` (어댑터, dry-run 모드 지원) |
| T-6 추천 페이지 BE | BE | `/api/match-move/state` (GET), `/api/match-move/action` (POST) |
| T-7 추천 페이지 FE | FE | `web/app/match-move/page.tsx` (서버 진입 + 클라 액션) |
| T-8 슬랙 알림 발신 | BE | `src/lib/slack-client.ts` |
| T-9 슬랙 이모지 수신 | BE | `/api/slack/events` (Slack URL verification + reaction_added) |
| T-10 이벤트 로깅 | BE | `src/lib/event-log.ts` (insertEvent 헬퍼) |

**판정**: 모듈 단순. 평균 0.4d. **단일 Sprint로 진행 가능**. 단 BE-FE 의존이 있는 T-6/T-7, T-3은 BE 스텁(타입 정의 + mock 응답)을 먼저 푸시한 후 FE 병렬 진행.

P1 (T-11 결과 수집, T-12 Funnel 리포트)도 BE 0.3d / FE 1d로 가벼움 → Sprint 1에 포함 (총 추정 BE 2.8d / FE 2.5d / 통합 0.5d ≈ 5.8d 예산).

## 위험 & 미확정 사항

- **PLAB 알림톡 인프라 API 명세**: PRD에 없음. **mock 어댑터로 구현 + dry-run 모드**. 실 발송은 인프라팀 확정 후 별도 PR. (ADR-004)
- **Slack workspace/채널 ID**: 환경변수만 받음. 실제 발송은 운영자가 webhook URL 설정 시 동작.
- **알림톡 템플릿 ID**: 인프라팀 발급 대기. `KAKAO_TEMPLATE_ID` env 변수로 분리.
- **PLAB API 키**: 환경변수 `PLAB_API_KEY`. 발급 전이라도 mock으로 빌드/테스트 가능.
- **운영 SOP 동기화**: F-9 운영 매뉴얼 문서는 사용자 책임.

## 환경변수 사전 목록

```
# 자체 DB
DATABASE_URL=postgres://...
# PLAB SQL Gateway
PLAB_API_BASE_URL=https://vibe.techin.pe.kr/api
PLAB_API_KEY=...
# 알림톡 (어댑터)
KAKAO_API_BASE_URL=...
KAKAO_API_KEY=...
KAKAO_TEMPLATE_ID=...
KAKAO_DRY_RUN=true   # true이면 발송 안 함, 로그만
# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_SIGNING_SECRET=...   # Slack events webhook 검증
SLACK_CHANNEL=#match-move-test
# 토큰
HMAC_SECRET=...
# 페이지
PUBLIC_BASE_URL=https://test.plab.com
# 운영
TZ=Asia/Seoul
NODE_ENV=production
PORT=4000
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000   # 클라이언트가 호출하는 API
API_BASE_URL=http://localhost:4000               # 서버 컴포넌트가 호출하는 API (내부망)
```

## 다음 단계
Phase 2 DESIGN으로 진행. architecture.md / DESIGN.md / ADR 작성.
