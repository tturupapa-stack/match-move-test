# DEV Team Learnings

## Sprint 1 — 매니저 매치 이동 테스트 (2026-05-20)

### L-2026-05-20-01: Zod discriminated union 좁힘은 `parsed.data`를 다시 변수로 받아야 한다
- **컨텍스트**: `z.discriminatedUnion('action', [select, keep])` 통과 후 `parsed.data.action === 'keep'` 분기 내부에서 다음 분기로 진입 시 TS가 union을 잃는 경우가 있음 (TS 5.7, control-flow narrowing).
- **해결**: `const body = parsed.data;`로 받아두고 `body.action === 'select'` 분기에서 `body.selectedMatchId` 접근하면 좁힘 유지.
- **재발 빈도**: 1회 (Wave 2 build 1차 실패).

### L-2026-05-20-02: noUncheckedIndexedAccess + pg rows[0] 는 항상 가드 필요
- pg `QueryResult.rows` 인덱스 접근은 `noUncheckedIndexedAccess`에서 `T | undefined`.
- 권장 패턴:
  ```ts
  const row = res.rows[0];
  if (!row) throw new Error('expected one row');
  ```
- recipes/db-row-guard.md 참조.

### L-2026-05-20-03: Express 5 + Slack webhook은 raw body 필요 → JSON parser 등록 순서 주의
- Slack signing-secret 검증은 raw body 해시 → `app.use(express.json())`가 먼저 등록되면 raw 캡처 불가.
- 해결: Slack 라우터 등록 → 이후 `express.json()` 등록. (app.ts 순서 확정)

### L-2026-05-20-04: PLAB SQL Gateway의 `match` 백틱 강제는 모든 헬퍼에 일관 적용 — 테스트로 못박기
- `tests/plab-api-client.test.ts`에 `expect(sql).toMatch(/\`match\`/)` 검증 추가.
- recipes/plab-sql-client.md 참조.

### L-2026-05-20-05: Token 만료 마진(60s) — verify 함수가 직접 처리
- ADR-001 따라 `verifyToken(token, secret, { marginSeconds: 60 })` 옵션으로 일관 처리. 호출처마다 비교 코드 작성하면 누락 가능.

### L-2026-05-20-06: targets UNIQUE 제약 + ON CONFLICT — 멱등성 in SQL 수준
- 응용 레이어 dedup 체크는 race 가능. UNIQUE(manager_id, current_match_id) + ON CONFLICT DO NOTHING으로 원자성.
- (ADR-006)

### L-2026-05-20-07: Next.js 15 App Router — `searchParams` is `Promise`
- Next.js 15부터 page props의 `searchParams`/`params`가 Promise. `await props.searchParams` 필요.
- 빌드 단계에서 타입 에러로 잡힘.

---

## Sprint 1 — 검수 / 실연동 단계 (2026-05-21)

### L-2026-05-21-01: `.env` 자동 로드를 어디서도 안 하면 server·migrate·dry-run 모두 침묵 실패
- **증상**: `.env` 파일이 root에 있어도 `process.env.DATABASE_URL`가 `undefined`. migrate가 `DATABASE_URL is required`로 즉시 exit. server 부팅도 zod env 검증에서 throw.
- **원인 분석**: dev-architect가 생성한 코드 어디에도 `dotenv` import가 없고 `node --env-file`도 미설정. tsx/vitest는 cwd의 `.env`를 자동 로드하지 않음.
- **해결 (Node 22+ 표준 — 의존성 0)**: `server/package.json`의 4개 script(`dev`, `start`, `migrate`, `dry-run`)에 `--env-file=../.env` 추가.
  - 주의: `tsx watch`의 경우 `tsx watch --env-file=../.env src/index.ts` 순서 (watch 뒤에 옵션). `tsx --env-file=... watch ...`는 tsx가 `watch`를 entry file로 오해함.
  - `NODE_OPTIONS=--env-file=...`는 Node가 보안상 거부 (`is not allowed in NODE_OPTIONS`).
- **재발 방지**: dev-architect가 새 Node 프로젝트 생성 시 phase 2 architecture.md에 "env 로드 전략"을 명시 항목으로 추가하고, phase 3 EXECUTE 완료 직후 `printenv | grep <KEY>` 또는 `node -e 'console.log(process.env.X)'`로 1회 검증.
- **재발 빈도**: 1회 (이번 검수에서 발견)

### L-2026-05-21-02: 외부 API wire 명세는 P0에서 실 ping 1회 — 단위 테스트만으로는 추측 오류를 못 잡는다
- **증상**: dry-run 실행 시 PLAB SQL Gateway가 `HTTP 400 {"success":false,"error":"Query is required"}` 반환. 클라이언트는 `{ sql, params }` body + `{ rows: [] }` 응답 가정했으나, 실제는 `{ query, params }` body + `{ success, data, rowCount, executionTime }` 응답.
- **원인 분석**: PRD에 "단일 SQL 엔드포인트 `POST /api/query`, prepared statement params 배열 사용" 한 줄만 있고 정확한 필드명·응답 schema가 없었음. dev-architect가 일반 SQL gateway 관례(`sql`/`rows`)로 추측. 단위 테스트는 mock도 같은 추측을 따라서 fetch까지 가지 못한 채 통과.
- **해결**:
  1. `PlabApiClient.executeSql`: request `{ query: sql, params }`, response 파싱은 `{ success, data, rowCount, executionTime }`로 변경. 호출자 영향 0을 위해 내부에서 `data` → `rows` 정규화.
  2. mock 응답·assertion도 새 wire 형식으로 일괄 수정 (2개 테스트 파일).
- **재발 방지**: 외부 의존이 있는 P0 작업에서는 **phase 3 종료 직전 실 endpoint에 `SELECT 1` 또는 동등한 ping 1회 필수**. PRD에 wire 명세가 빠지면 phase 2 DESIGN 단계에서 "확인 필요 항목"으로 명시하고 phase 3 시작 전 사용자에게 1회 묻기. `recipes/plab-sql-client.md`에 실제 wire 형식 갱신 권장.
- **재발 빈도**: 1회 (이번 검수에서 발견. 동일 클래스의 외부 API 추측 오류는 일반적 패턴이므로 우선순위 ↑)

### L-2026-05-21-03: tsx watch 옵션 순서 — subcommand가 옵션을 삼킨다
- **증상**: `tsx --env-file=../.env watch src/index.ts` 실행 시 tsx가 `watch`를 entry file로 인식 → `ERR_MODULE_NOT_FOUND: Cannot find module '.../server/watch'`.
- **해결**: subcommand(`watch`)를 옵션보다 먼저 → `tsx watch --env-file=../.env src/index.ts`.
- **재발 방지**: tsx subcommand(watch, eval 등) 사용 시 옵션은 subcommand 뒤로.
- **재발 빈도**: 1회 (이번 검수)

### L-2026-05-21-04: pg는 BIGSERIAL/bigint(int8)를 JS 문자열로 반환 — zod number 검증이 깨진다
- **증상**: `targets.id`(BIGSERIAL)를 RETURNING/SELECT하면 pg가 `'1'`,`'2'` 문자열로 반환. 이를 API 응답에 그대로 실어 클라이언트가 다시 `POST .../mark`로 보내면 `z.array(z.number())` 검증이 400으로 거부. UI에서 "발송 완료 처리"가 조용히 실패.
- **원인**: node-postgres 기본 동작 — int8은 정밀도 보존 위해 문자열. int4(integer)만 number.
- **해결**: (a) API 경계에서 `Number(row.id)`로 정규화하여 응답, (b) 입력 zod는 `z.coerce.number()`로 방어. SQL `... = ANY($1::bigint[])`는 문자열 배열도 캐스팅되어 DB는 무관 — 깨지는 곳은 오직 애플리케이션 검증 계층.
- **재발 방지**: BIGSERIAL PK를 API로 노출/수신하는 모든 경계에서 number 정규화 + coerce. 또는 pg type parser로 int8→Number 전역 등록(안전 범위 가정 시).
- **재발 빈도**: 1회 (E2E 검증에서 발각 — 단위 테스트는 mock이라 못 잡음, 실 DB 왕복 E2E가 필요했음. L-2026-05-21-02와 동일 교훈)

### L-2026-05-21-05: 외부 업로드 양식(비즈엠 등)은 from-scratch 생성 금지 — 원본 템플릿 복사 후 데이터 행만 채운다
- **맥락**: 비즈엠 대용량 발송 양식은 "엑셀 서식을 변경하여 업로드할 경우 데이터가 다르게 보내질 수 있습니다. 서식 그대로 발송"이라 명시. 헤더가 2단(그룹/세부)이고 셀 병합·드롭다운·안내문이 포함됨.
- **해결**: 원본 .xlsx를 `server/assets/`에 템플릿으로 두고 exceljs `readFile`→샘플행 값만 클리어→데이터 행 채움→`writeBuffer`. 행 삭제 대신 셀 값만 비워 병합/서식 손상 방지.
- **자산 경로**: `import.meta.url` 기준 `../../assets/...`로 dev(src/lib)·prod(dist/lib) 모두 server/assets로 귀결. tsc는 .xlsx를 dist로 복사하지 않으므로 원본을 server/assets에 유지.
- **재발 방지**: 서드파티 업로드 포맷(엑셀/CSV 템플릿)은 항상 공급자 원본을 템플릿화. 컬럼 letter(AG, AP 등)로 채우고, 셀 매핑은 단위 테스트로 못박기.
- **재발 빈도**: 신규 패턴 (recipes 후보)

### L-2026-05-21-06: Node `--env-file`은 기존 환경변수를 덮어쓰지 못한다 — 셸 오염 시 dotenv override 필요 (L-01 보강)
- **증상**: `.env`에 `SLACK_WEBHOOK_URL=https://...`를 넣어도 앱에서 빈 문자열로 읽힘. 같은 파일의 다른 키(PLAB/HMAC)는 정상.
- **원인**: 실행 환경(셸/하네스)에 `SLACK_WEBHOOK_URL=''`(빈값)이 이미 export돼 있었고, **Node `--env-file`은 이미 정의된 환경변수를 `.env` 값으로 덮어쓰지 않는다**(우선순위: 기존 env > 파일). PLAB/HMAC은 셸에 없어서 파일값이 적용됨. 셸 오염 출처는 user profile이 아니라 하네스 주입이라 통제 불가.
- **추가 증상**: Node `--env-file` 및 dotenv 모두 따옴표 없는 값이 `#`로 시작하면(`SLACK_CHANNEL=#match-move-test`) `#` 이후를 주석 처리해 빈값이 됨.
- **해결**: `--env-file`을 폐기하고 `dotenv` + `{ override: true }`로 전환. 진입점(`server/src/env.ts`)과 `scripts/migrate.ts` 최상단에서 `import.meta.url` 기준 루트 `.env`를 override 로드. 단 **`NODE_ENV==='test'`면 스킵**(vitest의 NODE_ENV/기본값 보존, .env의 `NODE_ENV=development`가 테스트 환경을 덮지 않도록). `#`로 시작하는 값은 `.env`에서 따옴표로 감싼다(`SLACK_CHANNEL="#match-move-test"`).
- **재발 방지**: 환경변수가 셸에 주입될 수 있는 환경(CI/하네스/컨테이너)에서는 `.env`를 신뢰 소스로 강제하려면 `--env-file`이 아니라 `dotenv override`를 쓴다. 값에 `#`/공백/특수문자가 있으면 따옴표 필수.
- **재발 빈도**: 1회 (L-2026-05-21-01에서 채택한 `--env-file` 방식의 한계가 슬랙 연동에서 드러남)
