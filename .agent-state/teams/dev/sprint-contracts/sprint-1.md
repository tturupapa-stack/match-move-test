# Sprint 1 Contract — 매니저 매치 이동 테스트 시스템

> Phase 2.5 CONTRACT (Standard 모드, evaluator 미스폰 — architect self-review)
> Phase 3 EXECUTE 진입 시 backend-dev + frontend-dev 병렬 스폰

## 목표
PRD §4.1 P0 10개 + P1 (T-11, T-12) 모듈 완료. dry-run 시나리오 통과.

## 성공 기준 (Definite of Done)

1. `npm install`이 root에서 성공.
2. `npm run build`가 **양 패키지(server, web)** 에서 성공 (에러 0).
3. `npm run -w server test`에서 단위 테스트 통과 (≥10 케이스).
4. `npm run -w server dry-run`이 KAKAO_DRY_RUN=true 환경에서 성공 — PLAB mock 또는 실 PLAB 호출 후 자체 DB targets 행 INSERT 확인.
5. `.env.example` 키 ↔ env.ts zod schema ↔ 사용처 일치 (Integration Coherence).
6. Express 라우트 등록 ↔ FE fetch 경로 일치.
7. 모든 ADR 라우트/타입/디렉토리 식별자 변경 없음.

## 파일 소유권 (변경 금지)

### backend-dev (server/)
- `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`
- `server/src/index.ts`
- `server/src/env.ts`
- `server/src/lib/db.ts`
- `server/src/lib/plab-api-client.ts`
- `server/src/lib/kakao-client.ts`
- `server/src/lib/slack-client.ts`
- `server/src/lib/slack-verify.ts`
- `server/src/lib/token.ts`
- `server/src/lib/event-log.ts`
- `server/src/lib/time.ts`
- `server/src/lib/logger.ts`
- `server/src/batch/extract-targets.ts`
- `server/src/batch/collect-results.ts`
- `server/src/batch/scheduler.ts`
- `server/src/server/app.ts`
- `server/src/server/middleware/error.ts`
- `server/src/server/routes/health.ts`
- `server/src/server/routes/match-move.ts`
- `server/src/server/routes/slack-webhook.ts`
- `server/src/server/routes/admin-config.ts`
- `server/src/server/routes/admin-funnel.ts`
- `server/src/types/api.ts`
- `server/tests/*.test.ts` (≥4 파일: plab-api-client, token, event-log, extract-targets)
- `migrations/001-init.sql`, `migrations/002-unique-target.sql`
- `scripts/migrate.ts`, `scripts/dry-run-extract.ts`
- root: `package.json`, `tsconfig.base.json`, `.env.example`, `.gitignore`, `README.md`

### frontend-dev (web/)
- `web/package.json`, `web/next.config.mjs`, `web/tsconfig.json`
- `web/tailwind.config.ts`, `web/postcss.config.mjs`
- `web/app/layout.tsx`, `web/app/globals.css`, `web/app/page.tsx`
- `web/app/match-move/page.tsx`
- `web/app/admin/config/page.tsx`
- `web/app/admin/funnel/page.tsx`
- `web/components/match-card.tsx`
- `web/components/action-buttons.tsx`
- `web/components/config-form.tsx`
- `web/components/funnel-view.tsx`
- `web/components/status-banner.tsx`
- `web/lib/api.ts`
- `web/lib/format.ts`

### 공유 의존 (소유는 backend-dev, frontend-dev는 import만)
- `server/src/types/api.ts`: FE는 `next.config.mjs`의 `transpilePackages: ['@match-move/server']` 또는 relative import로 가져옴.

## API 의존성 (BE → FE blocker)

backend-dev는 **Wave 1**에서 다음을 먼저 완성하여 FE 진행 가능하게 함:
1. `server/src/types/api.ts` — 전체 타입 export (실 구현 전이라도)
2. `server/src/server/app.ts` + 라우트 스텁 (mock 응답 반환):
   - `GET /api/match-move/state` → `{ ok: true, data: { status: 'ok', current: {...mock}, recommendations: [...mock] } }`
   - `POST /api/match-move/action` → `{ ok: true, data: { status: 'accepted' } }`
   - `GET /api/admin/config` → `{ ok: true, data: { current: {low:4,high:6}, history: [] } }`
   - `PUT /api/admin/config` → 동일 echo
   - `GET /api/admin/promotion-map` → `{ ok: true, data: [] }`
   - `PUT /api/admin/promotion-map` → 동일 echo
   - `GET /api/admin/funnel` → `{ ok: true, data: {...mock} }`
3. 위 완료 시 backend-dev는 "WAVE_1_DONE" 신호 (보고에 명시).

frontend-dev는 Wave 1 완료 후 진행. 실 응답은 Wave 2에서 채워짐 — FE는 타입에 의존하므로 영향 없음.

## 거짓 보고 방지 (DEV/L-001)

architect는 각 specialist 완료 보고를 받으면 다음을 직접 실행:
1. **디스크 검증**: `ls -la {경로}` 또는 `Glob`로 보고된 파일 5개 sampling.
2. **빌드 검증**: 
   - server: `cd /Users/larkkim/project_R && npm run -w server build`
   - web: `cd /Users/larkkim/project_R && npm run -w web build`
3. 실패 시 **재작업 지시 1회** → 2번째 실패 시 부모에게 차단 보고.

## 추정 (참고)
- backend-dev: 2.8d
- frontend-dev: 2.5d (Wave 1 대기 ~0.3d 포함)
- 통합/QA: 0.5d
- 합계: ~5.8d

## 미해결 사항 (Sprint 종료 후 follow-up)
- 실 PLAB API 키 발급 후 `dry-run`에서 실 호출 검증 (현 Sprint는 mock 가능)
- Kakao 알림톡 실 인프라 연동 (별도 PR)
- E2E 테스트 (Playwright) — Full 모드 별도 실행 필요
