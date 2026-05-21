# Phase 2: ARCHITECTURE

## 1. 모노레포 구성

**npm workspaces 2-패키지 구성**:

```
/Users/larkkim/project_R/
├── package.json                # workspace root
├── pnpm-workspace.yaml         # 사용 안 함 (npm workspaces)
├── tsconfig.base.json
├── .env.example
├── .gitignore
├── DESIGN.md
├── PRD-매니저매치이동테스트.md
├── README.md
├── migrations/
│   ├── 001-init.sql
│   └── 002-unique-target.sql
├── scripts/
│   ├── migrate.ts              # node --import tsx scripts/migrate.ts
│   └── dry-run-extract.ts      # 실 발송 없이 추출만 검증
├── server/                     # Express + 배치 (BE)
│   ├── package.json            # name: @match-move/server
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── index.ts            # entry: Express + scheduler
│   │   ├── env.ts              # zod 검증된 env 객체 export
│   │   ├── lib/
│   │   │   ├── db.ts           # pg Pool singleton
│   │   │   ├── plab-api-client.ts  # PlabApiClient + Q1/Q2/Q4/Q5/Q6
│   │   │   ├── kakao-client.ts # 알림톡 어댑터 (dry-run 지원)
│   │   │   ├── slack-client.ts # 슬랙 webhook 발신
│   │   │   ├── slack-verify.ts # Slack signing secret 검증
│   │   │   ├── token.ts        # HMAC encode/verify
│   │   │   ├── event-log.ts    # insertEvent
│   │   │   ├── time.ts         # KST 헬퍼 (formatKstSchedule 등)
│   │   │   └── logger.ts       # pino 또는 console wrapper
│   │   ├── batch/
│   │   │   ├── extract-targets.ts  # F-2 본체
│   │   │   ├── collect-results.ts  # F-7 (P1)
│   │   │   └── scheduler.ts        # node-cron 등록
│   │   ├── server/
│   │   │   ├── app.ts          # Express 앱 factory
│   │   │   ├── middleware/
│   │   │   │   └── error.ts
│   │   │   └── routes/
│   │   │       ├── match-move.ts   # /api/match-move/{state,action}
│   │   │       ├── slack-webhook.ts # /api/slack/events
│   │   │       ├── admin-config.ts # /api/admin/config, /promotion-map
│   │   │       └── admin-funnel.ts # /api/admin/funnel (P1)
│   │   └── types/
│   │       └── api.ts          # 공유 응답 타입 (FE에서도 import)
│   └── tests/
│       ├── plab-api-client.test.ts
│       ├── token.test.ts
│       ├── event-log.test.ts
│       └── extract-targets.test.ts
└── web/                        # Next.js 15 App Router (FE)
    ├── package.json            # name: @match-move/web
    ├── next.config.mjs
    ├── tsconfig.json
    ├── tailwind.config.ts
    ├── postcss.config.mjs
    ├── app/
    │   ├── layout.tsx
    │   ├── globals.css
    │   ├── page.tsx            # 홈 — 단순 안내
    │   ├── match-move/
    │   │   └── page.tsx        # 추천 페이지 (Server Component + Client form)
    │   └── admin/
    │       ├── config/
    │       │   └── page.tsx    # F-1/F-1B 설정
    │       └── funnel/
    │           └── page.tsx    # F-8 Funnel (P1)
    ├── components/
    │   ├── match-card.tsx
    │   ├── action-buttons.tsx (Client)
    │   ├── config-form.tsx (Client)
    │   └── status-banner.tsx
    └── lib/
        ├── api.ts              # fetch wrappers
        └── format.ts           # KST 포맷
```

**근거**:
- 단일 패키지 시 Next.js + Express 의존성 충돌 가능 (Next.js 빌드가 server 코드를 트랜스파일 시도). 분리로 격리.
- 공유 타입(`api.ts`)은 server에 두고 web에서 relative import (`../../server/src/types/api`) — Next.js 트랜스파일 대상에 server 디렉토리 포함 필요. → `next.config.mjs`의 `transpilePackages` 사용.
- 마이그레이션은 루트에 둠 (단순 SQL 파일).

## 2. 환경변수 키 (확정)

`.env.example`에 정의. 모든 키는 server 패키지의 `src/env.ts`에서 zod 검증 후 export.

```ini
# === Database ===
DATABASE_URL=postgres://postgres:postgres@localhost:5432/match_move

# === PLAB SQL Gateway ===
PLAB_API_BASE_URL=https://vibe.techin.pe.kr/api
PLAB_API_KEY=__required__

# === Kakao 알림톡 (어댑터) ===
KAKAO_API_BASE_URL=
KAKAO_API_KEY=
KAKAO_TEMPLATE_ID=
KAKAO_DRY_RUN=true

# === Slack ===
SLACK_WEBHOOK_URL=
SLACK_SIGNING_SECRET=
SLACK_CHANNEL=#match-move-test

# === Token ===
HMAC_SECRET=__required_min_32_chars__

# === 운영 ===
TZ=Asia/Seoul
NODE_ENV=development
PORT=4000
PUBLIC_BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:4000

# === Next.js (web) ===
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

## 3. Express 라우트 트리 (확정 — Phase 3 중 변경 금지)

| Method | Path | 핸들러 | 용도 |
|---|---|---|---|
| GET | `/healthz` | health.ts | 헬스체크 |
| GET | `/api/match-move/state` | match-move.ts | 토큰 검증 + Q4 재조회 → 표시할 상태 반환 |
| POST | `/api/match-move/action` | match-move.ts | 액션 수신 (`select`/`keep`) → 슬랙 알림 + 이벤트 로그 |
| POST | `/api/slack/events` | slack-webhook.ts | Slack URL verification + reaction_added |
| GET | `/api/admin/config` | admin-config.ts | 현재 기준값 + 변경 이력 |
| PUT | `/api/admin/config` | admin-config.ts | 기준값 갱신 |
| GET | `/api/admin/promotion-map` | admin-config.ts | test_type별 금액 매핑 조회 |
| PUT | `/api/admin/promotion-map` | admin-config.ts | 매핑 갱신 |
| GET | `/api/admin/funnel` | admin-funnel.ts (P1) | Funnel 집계 |

## 4. API 응답 타입 (확정 — server/src/types/api.ts)

```ts
// === Common ===
export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: string; message: string } };
export type ApiResult<T> = ApiOk<T> | ApiErr;

// === Match move state (GET /api/match-move/state) ===
export type MatchMoveState =
  | { status: 'ok'; current: CurrentMatch; recommendations: RecommendedMatch[] }
  | { status: 'already_actioned' }
  | { status: 'deadline_passed' }
  | { status: 'invalid_token' }
  | { status: 'no_recommendations'; current: CurrentMatch };

export type CurrentMatch = {
  matchId: number;
  scheduleKst: string;       // 'YYYY-MM-DD HH:mm'
  stadiumName: string;
  participantCount: number;
};

export type RecommendedMatch = {
  matchId: number;
  scheduleKst: string;
  stadiumName: string;
  participantCount: number;
  isTransferOrigin: boolean; // manager_return=1
  isPromotion: boolean;      // test_type IN (3,6,7,8,9)
};

// === Match move action (POST /api/match-move/action) ===
export type MatchMoveActionBody =
  | { token: string; action: 'select'; selectedMatchId: number }
  | { token: string; action: 'keep' };

export type MatchMoveActionResult =
  | { status: 'accepted' }
  | { status: 'already_actioned' }
  | { status: 'deadline_passed' }
  | { status: 'invalid_token' }
  | { status: 'invalid_selection' };

// === Admin config ===
export type AdminConfig = {
  current: { lowThreshold: number; highThreshold: number };
  history: Array<{
    lowThreshold: number;
    highThreshold: number;
    changedBy: string | null;
    changedAt: string;       // ISO8601
  }>;
};
export type AdminConfigUpdateBody = {
  lowThreshold: number;
  highThreshold: number;
  changedBy?: string;
};

// === Promotion map ===
export type PromotionMap = Array<{
  testType: number;
  amount: number;
  updatedBy: string | null;
  updatedAt: string;
}>;
export type PromotionMapUpdateBody = {
  entries: Array<{ testType: number; amount: number }>;
  updatedBy?: string;
};

// === Funnel (P1) ===
export type FunnelReport = {
  range: { from: string; to: string };
  steps: {
    extracted: number;
    messageSent: number;
    pageEntered: number;
    changeRequested: number;
    keptExisting: number;
    changeCompleted: number;
  };
  derived: {
    changeRequestRate: number;       // changeRequested / messageSent
    completionRate: number;          // changeCompleted / changeRequested
  };
  costSavings: {
    completedTransferPromotion: number;
    totalEstimatedAmount: number;
  };
};
```

## 5. 데이터베이스 마이그레이션

`migrations/001-init.sql`: PRD §3.1 그대로 + ADR-005 보완:

```sql
CREATE TABLE test_config (
  id BIGSERIAL PRIMARY KEY,
  low_threshold INT NOT NULL,
  high_threshold INT NOT NULL,
  changed_by VARCHAR(64),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE promotion_amount_map (
  test_type INT PRIMARY KEY,
  amount INT NOT NULL,
  updated_by VARCHAR(64),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE targets (
  id BIGSERIAL PRIMARY KEY,
  manager_id INT NOT NULL,
  manager_name VARCHAR(64),
  current_match_id INT NOT NULL,
  current_match_info JSONB NOT NULL,
  recommended_matches JSONB NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  token_expires_at TIMESTAMPTZ NOT NULL,
  extracted_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_targets_manager_match ON targets(manager_id, current_match_id);

CREATE TABLE event_log (
  id BIGSERIAL PRIMARY KEY,
  target_id BIGINT REFERENCES targets(id),
  event_type VARCHAR(32) NOT NULL,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);
CREATE INDEX idx_event_log_target ON event_log(target_id);
CREATE INDEX idx_event_log_type ON event_log(event_type);

-- Seed: 초기 기준값
INSERT INTO test_config (low_threshold, high_threshold, changed_by)
VALUES (4, 6, 'system')
ON CONFLICT DO NOTHING;
```

`migrations/002-unique-target.sql` (ADR-006):
```sql
ALTER TABLE targets ADD CONSTRAINT uniq_manager_match UNIQUE (manager_id, current_match_id);
```

## 6. 배치 스케줄링

`node-cron` 단일 워커 (`scheduler.ts`):

```ts
import cron from 'node-cron';
import { runExtractTargets } from './extract-targets';
import { runCollectResults } from './collect-results';

export function startSchedulers() {
  // F-2: 매시 정각 (15-20시 KST). 매시 정각에 3시간 후 매치 추출.
  cron.schedule('0 15-20 * * *', () => runExtractTargets(), {
    timezone: 'Asia/Seoul',
    noOverlap: true,
    name: 'extract-targets',
  });
  // F-7 (P1): 매 분마다 +3h 경과한 테스트 매치 결과 수집 체크 (cheap 쿼리).
  cron.schedule('* * * * *', () => runCollectResults(), {
    timezone: 'Asia/Seoul',
    noOverlap: true,
    name: 'collect-results',
  });
}
```

## 7. 단일 Sprint 실행 흐름

```
Phase 3 EXECUTE
├── BE wave 1 (선행 — FE blocker)
│   ├── env.ts, db.ts, types/api.ts (FE도 import)
│   ├── token.ts
│   ├── migrations/*.sql + scripts/migrate.ts
│   └── server/app.ts + 라우트 스텁 (mock 응답 반환)
├── BE wave 2 (병렬 가능)
│   ├── plab-api-client.ts + tests
│   ├── kakao-client.ts (dry-run)
│   ├── slack-client.ts + slack-verify.ts
│   ├── event-log.ts
│   ├── batch/extract-targets.ts + tests
│   ├── batch/collect-results.ts
│   ├── batch/scheduler.ts
│   ├── routes/match-move.ts (실 구현)
│   ├── routes/slack-webhook.ts
│   ├── routes/admin-config.ts
│   └── routes/admin-funnel.ts (P1)
└── FE (BE wave 1 완료 후 병렬)
    ├── web/lib/api.ts (BE types 활용)
    ├── app/match-move/page.tsx
    ├── app/admin/config/page.tsx
    └── app/admin/funnel/page.tsx
```

## 8. ADR 요약

| ID | 결정 | 근거 |
|---|---|---|
| ADR-001 | 토큰 만료 60초 마진 | 운영자 처리 가능 시간 보장 |
| ADR-002 | 단일 HMAC 시크릿 (회전 없음) | 일회용 시스템 |
| ADR-003 | Asia/Seoul 타임존 가정 | PLAB DB 관행 |
| ADR-004 | Kakao mock 어댑터 + dry-run | 실 인프라 명세 미확정 |
| ADR-005 | seed로 초기 기준값 4/6 삽입 | PRD §6.2 체크리스트 자동화 |
| ADR-006 | targets.UNIQUE(manager_id, current_match_id) | 중복 발송 원자적 방지 |
| ADR-007 | Express + Next.js 2-패키지 분리 | 의존성 격리 |
| ADR-008 | Slack 이모지 멱등성: NOT EXISTS 가드 | 중복 이벤트 방지 |

## 9. Integration Coherence 체크리스트 (Phase 3 종료 시)

- [ ] `server/src/types/api.ts`의 타입이 web에서 import 가능 (next.config.mjs `transpilePackages` 또는 path mapping)
- [ ] 모든 enum/status 문자열 ↔ FE 분기 mapping 일치 (`already_actioned`, `deadline_passed` 등)
- [ ] `.env.example` 키 ↔ `env.ts` zod schema ↔ 실제 사용처 일치
- [ ] Express 라우트 등록 ↔ FE fetch URL 일치
- [ ] 마이그레이션 컬럼명 ↔ pg 쿼리에서 사용한 컬럼명 일치
