# DESIGN — 매니저 매치 이동 가설 검증 테스트 시스템

> 본 문서는 개발 기준서. PRD(`PRD-매니저매치이동테스트.md`)와 함께 읽을 것.
> 본 시스템은 **일회용**이다. 가설 검증 종료 후 폐기.

## 0. 한 페이지 요약

- **목적**: 매치 시작 3h 전, 참가자 부족 매치의 매니저에게 더 좋은 매치를 추천 → 매니저 이동 의향 수집 → 운영자가 수동 처리.
- **스택**: TypeScript / Express 5 (server + 배치) / Next.js 15 App Router (web) / PostgreSQL / pg / node-cron / zod / vitest.
- **모노레포**: npm workspaces — `server/`, `web/`.
- **엔트리포인트**: `npm run dev` (서버 + 웹 동시 실행), `npm run build` (양쪽 빌드), `npm run test`.

## 1. 디렉토리 구조

architecture.md §1 참조. 핵심:
- `server/src/lib/*`: PlabApiClient, KakaoClient, SlackClient, token, db, event-log, time
- `server/src/batch/*`: extract-targets(F-2), collect-results(F-7), scheduler
- `server/src/server/routes/*`: match-move, slack-webhook, admin-config, admin-funnel
- `web/app/match-move/page.tsx`: 매니저용 추천 페이지
- `web/app/admin/{config,funnel}/page.tsx`: 운영자 화면

## 2. 환경변수

architecture.md §2 참조. `.env.example`를 복사해서 `.env` 만들고 채울 것.
주요 키: `DATABASE_URL`, `PLAB_API_KEY`, `KAKAO_DRY_RUN`, `SLACK_WEBHOOK_URL`, `SLACK_SIGNING_SECRET`, `HMAC_SECRET`(32자 이상), `PUBLIC_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`.

## 3. API 계약 (Express, port 4000)

architecture.md §3, §4 참조. 모든 응답은 `ApiResult<T>` 래퍼.

### 매니저 동선
1. `GET /api/match-move/state?t={token}` → `MatchMoveState`
2. `POST /api/match-move/action` body `MatchMoveActionBody` → `MatchMoveActionResult`

### 운영자 동선
1. 어드민 화면 진입 → `GET /api/admin/config`, `GET /api/admin/promotion-map`
2. 저장 → `PUT /api/admin/config`, `PUT /api/admin/promotion-map`
3. Funnel → `GET /api/admin/funnel?from=...&to=...`

### Slack 수신
- `POST /api/slack/events`: Slack URL verification(`type=url_verification` → `challenge` 반환), `event_callback` → `reaction_added` 처리. Signing secret 검증 필수.

## 4. 데이터 모델

PRD §3.1 + 마이그레이션 002 추가 UNIQUE 제약. `event_type` 값 9종(PRD §3.1).

## 5. PLAB SQL Gateway 사용 규칙

- 엔드포인트: `POST {PLAB_API_BASE_URL}/query`, 헤더 `X-API-Key`, body `{ sql, params }`.
- `match`는 백틱 필수: `` `match` ``.
- 모든 쿼리는 prepared statement (`?` 자리표시자 + params 배열).
- 재시도: 500 → 3회 backoff, 429 → 슬랙 알람 + 배치 건너뜀, 400/401 → 슬랙 알람 + throw.

## 6. 토큰 (HMAC)

```ts
// payload: { tid, exp }
// token = base64url(JSON) + '.' + base64url(HMAC-SHA256(HMAC_SECRET, JSON))
```
- `tid` = `targets.id`
- `exp` = ISO8601 (UTC). 검증 시 `now > exp - 60s`이면 만료 처리 (ADR-001).
- 검증은 `crypto.timingSafeEqual`.

## 7. 시간 다루기

- 자체 DB: TIMESTAMPTZ (내부 UTC).
- PLAB Q1 파라미터: KST 기준 정시 `YYYY-MM-DD HH:00:00` 포맷 문자열로 전달.
- 표시는 모두 KST `YYYY-MM-DD HH:mm`.
- 헬퍼: `server/src/lib/time.ts`의 `nowKst()`, `formatKstSchedule(date)`, `parseKstToUtc()`.
- 모든 프로세스 `TZ=Asia/Seoul` 설정 (env).

## 8. 배치 스케줄

- F-2 추출: `0 15-20 * * *` (KST), `noOverlap: true`.
- F-7 결과 수집: `* * * * *` (KST), `noOverlap: true`, 내부에서 +3h 경과 매치만 처리.

## 9. 알림톡 어댑터 (Kakao mock)

```ts
interface KakaoClient {
  sendMessage(args: {
    phone: string;
    templateId: string;
    variables: Record<string, string>;
    buttonUrl: string;
  }): Promise<{ ok: boolean; providerMessageId?: string; error?: string }>;
}
```

- `KAKAO_DRY_RUN=true`이면 console.log + ok 반환. 실 발송 없음.
- 실제 인프라 연동은 별도 PR로 분리(ADR-004).

## 10. Slack 발신

```ts
interface SlackClient {
  postChangeRequest(payload: { ... }): Promise<{ ts: string }>;
  postKeptExisting(payload: { ... }): Promise<void>;
}
```

- `chat.postMessage` 또는 `Incoming Webhook`. **PRD가 Webhook URL만 언급 → Incoming Webhook으로 구현**. `ts`를 못 받으므로 reaction 매칭은 message text의 식별자(`#target-{id}`)로 보완.

## 11. Slack 수신 (이모지 처리)

- `reaction_added` 이벤트 + 이모지 `white_check_mark`.
- 메시지 텍스트에서 `#target-{id}` 정규식 추출 → target 조회 → `change_completed` 이벤트 INSERT (NOT EXISTS 가드).
- metadata: `{ slack_user: ..., event_ts: ..., promotion_released_amount: number|null, is_transferred_origin: boolean }`.
- promotion_released_amount는 알림에 포함된 `test_type`을 `promotion_amount_map`에서 lookup하여 계산.

## 12. 매니저 추천 페이지 동작

1. Server Component `app/match-move/page.tsx`가 `searchParams.t`로 토큰 받음.
2. 서버에서 `GET {API_BASE_URL}/api/match-move/state?t=...` 호출. `cache: 'no-store'`.
3. 상태별 분기 렌더:
   - `ok`: 현재 매치 카드 + 추천 매치 리스트 + 액션 버튼들
   - `no_recommendations`: 안내 메시지 + 유지 버튼만
   - `already_actioned` / `deadline_passed` / `invalid_token`: 안내 메시지
4. 클라이언트 컴포넌트 `ActionButtons`가 `POST /api/match-move/action` 호출, 응답에 따라 메시지 갱신.

## 13. 어드민 화면

- 인증 없음 (테스트 시스템, 내부망 가정). `noindex` 메타 추가.
- `app/admin/config/page.tsx`: 서버 컴포넌트로 GET, 클라이언트 폼으로 PUT.
- `app/admin/funnel/page.tsx`: `from`/`to` 쿼리 파라미터 받아 GET.

## 14. 테스트 전략

- 단위: vitest. `plab-api-client`, `token`, `event-log`, `extract-targets` (PlabApiClient mock).
- 통합: dry-run 스크립트 `scripts/dry-run-extract.ts` — `KAKAO_DRY_RUN=true`로 실 발송 없이 전체 흐름 실행, DB에 행만 적재.
- 빌드 게이트: `npm run build`가 양쪽 패키지에서 통과해야 Sprint 완료.

## 15. 로깅

- `pino` 또는 `console` JSON. 모든 외부 호출(PLAB, Kakao, Slack)에 request_id 부착.
- 배치 시작/종료에 메트릭(추출 N건, 발송 성공/실패) 1줄 로그.

## 16. 실행 명령

```sh
# 초기 설정
npm install                       # workspace root에서 한 번
cp .env.example .env              # 채우기

# DB 마이그레이션
npm run -w server migrate

# 개발
npm run dev                       # server + web 동시 실행 (concurrently)

# 빌드
npm run build

# 테스트
npm run -w server test

# dry-run
npm run -w server dry-run
```

## 17. 보안 체크

- HMAC_SECRET 32자 이상 강제.
- Express에 `helmet`, JSON body parser limit `100kb`.
- Slack webhook 검증 시 timing-safe HMAC 비교.
- 매니저 phone 자체 DB에 저장 금지 (Q1 결과에서 호출 시점에만 사용).
- 모든 admin 화면은 `noindex,nofollow` 메타.

## 18. 참고 — Sprint Contract

`.agent-state/teams/dev/sprint-contracts/sprint-1.md` 참조.
