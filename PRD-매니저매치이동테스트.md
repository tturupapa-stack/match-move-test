# PRD: 매니저 매치 이동 가설 검증 테스트 시스템

> **문서 목적**: 가설 검증 테스트를 위한 일회용 시스템 개발 명세
> **연관 문서**: [매니저 매치 이동 가설 검증 테스트] (배경/가설/측정 지표는 해당 문서 참조), [운영 매뉴얼](./운영매뉴얼-매니저매치이동.md)
> **작성 기준**: 본 시스템은 가설 검증 완료 후 폐기되며, 본 개발에서 재사용하지 않음

> **개정 이력**
> - v1.0 (초안): 매시 정각 카카오 알림톡 자동 발송 방식
> - v1.1 (2026-05-21): 발송 방식을 비즈엠 대용량 발송 양식(엑셀) 생성 + 운영자 수동 발송으로 변경 (ADR-012). 매치 시간 필터를 **전체 시간(00~23시)** 으로 확장 (ADR-011).
> - **v1.2 (2026-05-21)**: 대상자 규모가 작을 것으로 예상되어 비즈엠 엑셀 방식을 폐기하고 **채널톡 복붙용 메시지(대상자별 복사 카드)** 방식으로 전환 (ADR-013). 변경 근거는 `/.agent-state/teams/dev/adr.md` 참조.

## 1. 시스템 개요

### 1.1 범위

매치 시작 3시간 전 대상 매니저를 자동 추출하여 **채널톡 복붙용 안내 메시지를 생성**하고, 운영자가 대상자별로 채널톡에서 발송한다. 매니저의 이동 요청을 받아 운영자가 PLAB 어드민에서 수동 처리하는 일회용 테스트 시스템.

> **발송 방식 (v1.2, ADR-013)**: 시스템은 메시지를 직접 발송하지 않는다. 매시 정각 추출된 대상자를 `pending` 상태로 누적하고, 운영자가 발송 관리 화면(F-3)에서 대상자별 카드의 [번호 복사]·[메시지 복사]로 채널톡에 붙여넣어 발송한 뒤 발송 완료 처리한다. (대상자 규모가 작아 대량발송 도구 대신 1:1 복붙 채택)

### 1.2 비목표 (Out of Scope)

- 매니저 변경 자동화 (운영자 수동 처리)
- 메시지 **자동** 발송 (운영자가 채널톡에 복붙하여 수동 발송 — ADR-013)
- 대량 발송 도구 연동 (대상자 규모가 작아 1:1 복붙으로 충분)
- 매니저 변경 UI 신규 개발 (기존 PLAB 어드민 사용)
- 추천 알고리즘 고도화 (단순 조건 매칭으로 한정)

### 1.3 아키텍처

```
[ PLAB DB ] ←─ SQL Gateway API ─ [ 테스트 시스템 ]
                                       ↓
                               [ 자체 DB ]  대상자 pending 누적
                               [ 추천 페이지 ]
                               [ 발송 관리 화면 ] ── 대상자별 복붙 카드(번호/메시지)
                                       ↓                      ↓
                               [ Slack Webhook ]      [ 운영자 ] ── 채널톡 1:1 복붙 발송 ──→ [ 매니저 ]
                                       ↓
[ PLAB 어드민 ] ←── 매니저 변경 ──── [ 운영자 ]
```

**구성 요소**
- **배치 워커**: 매시 정각 cron 실행. 대상자 추출 후 `notification_status='pending'`으로 누적 (자동 발송 없음)
- **추천 페이지**: 매니저가 안내 메시지의 링크 클릭 시 진입하는 웹페이지
- **발송 관리 화면**: 운영자가 대상자별 복붙용 메시지/번호를 복사하고 발송 완료를 처리하는 어드민 (F-3)
- **API 서버**: 추천 페이지 백엔드, 액션 수신, 슬랙 알림 전송, 복붙 메시지 생성/제공
- **자체 DB**: 대상자, 추천 매치, 발송 상태, 이벤트 로그 저장
- **PLAB API 클라이언트**: PLAB Playground SQL Gateway 호출 모듈 (대상 추출 + 발송 시점 연락처 조회)

## 2. 기능 명세

### 2.1 기준값 설정 화면 (F-1)

**대상 사용자**: 운영자
**기능**:
- 진행가능성 낮음 기준 (참가자 수) 입력 - 초기값 4
- 진행가능성 높음 기준 (참가자 수) 입력 - 초기값 6
- 변경 이력 표시

### 2.2 프로모션 금액 매핑 설정 화면 (F-1B)

**대상 사용자**: 운영자
**기능**:
- test_type 값(3, 6, 7, 8, 9)별로 환산 금액 입력
- 저장 시 자체 DB의 `promotion_amount_map` 테이블 갱신
- 비용 절감 부차 지표 계산에 사용

### 2.3 대상자 추출 배치 (F-2)

**트리거**: 매시 정각 (00:00 ~ 23:00, 전체 시간 — ADR-011)

**처리 흐름**:
1. 3시간 후 시작하는 정시 매치 조회 (Q1)
2. 정시 매치(`MINUTE=0`), status='release', 참가자 < 낮음 기준, 매니저 배정됨(`manager_return=0`)인 매치 추출
3. 각 대상 매치에 대해 같은 지역구·같은 시각 추천 매치 검색 (Q2)
4. 추천 매치 0개인 대상 매치는 제외
5. 자체 DB에 대상자 저장 (`notification_status='pending'`)
6. 이벤트 로그 기록 (`extracted`)
7. 신규 추출(`inserted > 0`)이 있으면 슬랙에 **대상자 추출 요약 알림** 발송 (F-5)

> **변경 (v1.1)**: 알림톡 자동 발송 트리거 제거. 추출된 대상자는 `pending`으로 누적되고, 발송은 운영자가 F-3 화면에서 pull한다. 시간대 제약(18~23시)을 제거하여 전체 정시 매치를 대상으로 한다.

**제외 조건**: 같은 매니저에게 이미 같은 매치에 대한 대상자 추출 이력이 있는 경우 (`UNIQUE(manager_id, current_match_id)` + `ON CONFLICT DO NOTHING`)

### 2.4 발송 자료 생성 (F-3)

**방식**: **채널톡 복붙용 메시지** 생성 → 운영자가 대상자별로 채널톡에서 1:1 발송 (ADR-013)

> **변경 (v1.2)**: 대상자 규모가 크지 않을 것으로 예상되어 비즈엠 대용량 발송(엑셀)을 폐기하고, 운영자가 채널톡 대화창에 바로 붙여넣을 수 있는 **대상자별 복붙 카드** 형식으로 전환 (ADR-013). 엑셀 양식·`exceljs`·LMS 폴백 제거.

**대상 사용자**: 운영자
**화면**: 발송 관리 (`/admin/export`)

**기능**:
- 발송 대기(`pending`) 대상 목록·건수 표시
- **대상자별 카드**: 매니저 이름·전화번호 + 복붙용 메시지(본문 + 추천 페이지 URL)
  - `GET /api/admin/export/pending` 가 카드 데이터(전화번호·`messageText`)를 반환
  - **[번호 복사]** / **[메시지 복사]** 버튼 → 채널톡 대화창에 붙여넣기
- **발송 완료 처리** (`POST /api/admin/export/mark`): 카드별 또는 전체 → `exported` 전환 + `bizm_exported` 이벤트 기록

**복붙 메시지 (messageText)** = 본문 + 마지막 줄에 추천 페이지 URL:
```
[{manager_name}] 안녕하세요.
{match_time} {stadium_name} 매치는 현재 참가자가 {participant_count}명으로 진행 가능성이 낮습니다.

근처에 진행 가능성이 높은 다른 매치로 이동하실 수 있습니다.
아래 링크를 눌러 추천 매치를 확인해주세요.

※ 변경 가능 시간: 매치 시작 1시간 30분 전까지

▶ 추천 매치 보기: https://test.plab.com/match-move?t={token}
```

**전화번호**: PLAB에서 **발송 관리 화면 조회 시점에 조회**(Q7)하며 자체 DB에 저장하지 않는다 (PRD §5.2). 카드 상단에 식별용으로 표시하고 [번호 복사]로 채널톡에서 대상을 찾는 데 사용. PLAB 조회 실패 시 메시지 목록은 그대로 표시하되 번호 칸은 "조회 실패"로 표기.

> **운영 타이밍**: 매시 정각 추출분이 `pending`으로 누적되므로, 운영자는 **매치 시작 1시간 30분 전(변경 마감)** 까지 복사→발송→완료 처리를 마쳐야 한다. 상세 절차는 [운영 매뉴얼](./운영매뉴얼-매니저매치이동.md) 참조.

### 2.5 추천 페이지 (F-4)

**URL**: `https://test.plab.com/match-move?t={token}`

**토큰**: HMAC 서명, 만료 시각 = 대상 매치 시작 시각 - 1시간 30분

**페이지 상태별 동작**:

| 상태 | 표시 |
| --- | --- |
| 정상 (마감 전, 미액션) | 현재 매치 + 추천 매치 3~5개 + 유지 버튼 |
| 이미 액션함 | "이미 응답이 접수되었습니다" |
| 마감 후 진입 | "변경 가능 시간이 종료되었습니다" |
| 토큰 오류 | "잘못된 접근입니다" |

**정상 상태 동작**:
- 페이지 진입 시: Q4로 추천 매치 최신 상태 재조회 → 조건 유지된 매치만 표시
- 추천 매치 선택 → 슬랙 알림 + "접수됨" 표시
- 유지 버튼 → 슬랙 알림 + "감사합니다" 표시

### 2.6 슬랙 알림 (F-5)

**채널**: `#match-move-test`

**대상자 추출 시** (배치 F-2 완료, 신규 `inserted > 0`):
```
📣 매치 이동 대상자 추출 / {timestamp}

대상 매치 시각: {target_schedule}
신규 발송 대기: {inserted}건 (검토 후보 {raw_candidates}건)

→ 발송 관리 화면에서 채널톡 발송 처리: {PUBLIC_BASE_URL}/admin/export
```
신규 0건이면 발송하지 않는다(노이즈 방지).

**변경 요청 시**:
```
🔔 매치 이동 요청 / {timestamp}

매니저: {manager_name} (ID: {manager_id})
현재 매치: {stadium_name} / {match_time} / 참가자 {n}명
요청 매치: {stadium_name} / {match_time} / 참가자 {n}명
양도 매물 여부: {YES/NO}
프로모션 매치 여부: {test_type 값 or NONE}

→ 처리 완료 시 이 메시지에 :white_check_mark: 이모지로 마킹
```

**유지 선택 시**: 단순 정보 알림. 운영자 처리 불필요.

### 2.7 운영자 처리 (F-6)

**시스템 외 액션**. 시스템은 이벤트 로그만 담당.

**운영자 SOP**:
1. 슬랙 알림 수신 → PLAB 어드민에서 추천 매치 상태 재확인
2. 매니저 변경 처리
3. 추천 매치가 양도 매물(`manager_return = 1`)이었던 경우, 프로모션 수동 해제
4. 매니저에게 완료 알림톡 발송
5. 슬랙 알림에 :white_check_mark: 이모지 추가 → 시스템이 webhook으로 수신하여 `change_completed` 이벤트 로그 기록

### 2.8 매치 결과 수집 (F-7)

**트리거**: 매치 시작 + 3시간

**처리**: Q6으로 매치 status와 최종 참가자 수 조회 → 이벤트 로그 기록

### 2.9 Funnel 리포트 (F-8)

**형태**: 어드민 페이지 또는 SQL 쿼리 기반 시트
**표시**: 측정 기간, 각 funnel 단계별 수치, 이동 요청률, 부차 지표

**Funnel 단계**: 추출됨 → **발송 완료(`bizm_exported`)** → 페이지 진입 → 변경 요청 → (유지 선택) → 운영자 처리 완료

> **변경 (v1.1+)**: 발송 단계 지표가 `message_sent` → `bizm_exported`로 대체됨(이벤트명은 호환 유지). **이동 요청률 = 변경 요청 ÷ 발송 완료 건수**.

부차 지표 — 비용 절감:
- 양도+프로모션 매치 이동 완료 건수
- test_type별 환산 금액 합산 (F-1B 설정 기반)
- 추정 잠재 절감 총액

## 3. 데이터 모델

### 3.1 자체 DB 스키마

```sql
-- 테스트 설정
CREATE TABLE test_config (
  id BIGSERIAL PRIMARY KEY,
  low_threshold INT NOT NULL,
  high_threshold INT NOT NULL,
  changed_by VARCHAR(64),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 프로모션 금액 매핑 (F-1B)
CREATE TABLE promotion_amount_map (
  test_type INT PRIMARY KEY,
  amount INT NOT NULL,
  updated_by VARCHAR(64),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 추출된 대상자
CREATE TABLE targets (
  id BIGSERIAL PRIMARY KEY,
  manager_id INT NOT NULL,
  manager_name VARCHAR(64),
  current_match_id INT NOT NULL,
  current_match_info JSONB NOT NULL,
  recommended_matches JSONB NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  token_expires_at TIMESTAMPTZ NOT NULL,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  -- v1.1 (ADR-012): 비즈엠 발송 상태 추적
  notification_status VARCHAR(16) NOT NULL DEFAULT 'pending', -- 'pending' | 'exported'
  exported_at TIMESTAMPTZ,
  export_count INT NOT NULL DEFAULT 0
);
-- v1.1: 중복 추출 방지 (같은 매니저+매치 1회만)
ALTER TABLE targets ADD CONSTRAINT uniq_manager_match UNIQUE (manager_id, current_match_id);
CREATE INDEX idx_targets_manager_match ON targets(manager_id, current_match_id);
CREATE INDEX idx_targets_notification_status ON targets(notification_status);

-- 이벤트 로그
CREATE TABLE event_log (
  id BIGSERIAL PRIMARY KEY,
  target_id BIGINT REFERENCES targets(id),
  event_type VARCHAR(32) NOT NULL,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);
CREATE INDEX idx_event_log_target ON event_log(target_id);
CREATE INDEX idx_event_log_type ON event_log(event_type);
```

**event_type 값 종류**:
- `extracted`: 대상자 추출됨
- `bizm_exported`: 운영자가 발송 완료 처리함 (발송 단계 지표. v1.2에서 채널톡 발송으로 전환됐으나 이벤트명은 데이터 호환을 위해 유지. metadata에 marked_by, channel)
- `page_entered`: 추천 페이지 진입
- `change_requested`: 변경 요청 (metadata에 selected_match_id)
- `kept_existing`: 유지 선택
- `entered_after_deadline`: 마감 후 진입
- `change_completed`: 운영자 처리 완료 (metadata에 promotion_released_amount, is_transferred_origin)
- `match_result`: 매치 종료 결과 (metadata에 status, final_participant_count)

> **변경 (v1.1)**: `message_sent` / `message_failed`(자동 알림톡 발송 지표) 제거 → `bizm_exported`(운영자 발송 완료 지표)로 대체.

### 3.2 PLAB API 연동

**Base URL**: `https://vibe.techin.pe.kr/api`
**인증**: `X-API-Key` 헤더
**프로토콜**: 단일 SQL 엔드포인트 (`POST /api/query`)
**SQL 방식**: prepared statement (`params` 배열) 사용

**중요**: `match`는 MySQL 예약어이므로 쿼리에서 반드시 백틱(`` ` ``)으로 감싸야 함.

#### Q1. 대상 매치 추출

```sql
SELECT 
  m.id AS match_id,
  m.schedule,
  m.manager_id,
  m.stadium_id,
  sg.area_id,
  sg.name AS stadium_name,
  mgr.name AS manager_name,
  mgr.phone AS manager_phone,
  (SELECT COUNT(*) FROM match_apply ma 
   WHERE ma.match_id = m.id AND ma.status = 'confirm') AS participant_count
FROM `match` m
JOIN stadium s ON m.stadium_id = s.id
JOIN stadium_group sg ON s.group_id = sg.id
JOIN manager mgr ON m.manager_id = mgr.id
WHERE m.status = 'release'
  AND m.manager_id IS NOT NULL
  AND m.manager_return = 0
  AND m.schedule = ?  -- 3시간 후 정시
  AND MINUTE(m.schedule) = 0
HAVING participant_count < ?  -- 낮음 기준
```

> **변경 (v1.1, ADR-011)**: `HOUR(m.schedule) BETWEEN 18 AND 23` 시간대 제약 제거. 전체 시간(정시)을 대상으로 한다. `MINUTE=0` 정시 제약은 유지.

#### Q2. 추천 매치 검색

```sql
SELECT 
  m.id AS match_id,
  m.schedule,
  m.stadium_id,
  sg.name AS stadium_name,
  sg.area_id,
  m.manager_return,
  m.test_type,
  (SELECT COUNT(*) FROM match_apply ma 
   WHERE ma.match_id = m.id AND ma.status = 'confirm') AS participant_count
FROM `match` m
JOIN stadium s ON m.stadium_id = s.id
JOIN stadium_group sg ON s.group_id = sg.id
WHERE m.status = 'release'
  AND (m.manager_id IS NULL OR m.manager_return = 1)
  AND m.schedule = ?
  AND sg.area_id = ?
HAVING participant_count >= ?  -- 높음 기준
```

#### Q4. 추천 매치 최신 상태 재조회 (페이지 진입 시)

```sql
SELECT 
  m.id, m.status, m.manager_id, m.manager_return,
  (SELECT COUNT(*) FROM match_apply ma 
   WHERE ma.match_id = m.id AND ma.status = 'confirm') AS participant_count
FROM `match` m
WHERE m.id IN (?, ?, ?)  -- 추천 매치 ID 리스트
```

페이지에 표시할 매치는 이 결과에서 `status='release' AND (manager_id IS NULL OR manager_return=1) AND participant_count >= 높음기준`인 매치만 필터링.

#### Q5. 양도 매물 여부 확인 (슬랙 알림 시)

```sql
SELECT id, manager_return, test_type
FROM `match`
WHERE id = ?
```

`manager_return = 1`이면 양도 매물, `test_type IN (3,6,7,8,9)`이면 프로모션 매치.

#### Q6. 매치 결과 조회

```sql
SELECT 
  m.id, m.status,
  (SELECT COUNT(*) FROM match_apply ma 
   WHERE ma.match_id = m.id AND ma.status = 'confirm') AS final_participant_count
FROM `match` m
WHERE m.id IN (?, ?, ?)  -- 테스트 매치 ID 리스트
```

`status = 'release'`이면 진행, `cancel`이면 취소, `hidden`은 별도 분류.

#### Q7. 매니저 연락처 조회 (발송 관리 화면 조회 시, v1.1+)

```sql
SELECT id, phone
FROM manager
WHERE id IN (?, ?, ?)  -- 발송 대기 대상자의 manager_id 목록
```

발송 관리 화면(`/admin/export/pending`) 조회 시점에만 호출하며, 조회한 `phone`은 자체 DB에 저장하지 않는다 (PRD §5.2).

### 3.3 PLAB API 할당량 관리

| 쿼리 | 일일 추정 호출 수 (50개 매치 모수) |
| --- | --- |
| Q1 | 24 (매시 정각 1회 — v1.1 전체 시간) |
| Q2 | 평균 15~25 (시간대 확장으로 증가) |
| Q4 | 평균 5 |
| Q5 | 평균 3 |
| Q6 | 50 / 테스트 기간 |
| Q7 (연락처) | 발송 관리 화면 조회당 1회 |
| **합계** | **약 60~80회/일** |

**[확인 필요]** API 키 발급 후 일일 할당량 확인. v1.1(전체 시간 확장)로 호출량이 증가했으므로 **100회 이상 권장**. 부족 시 매치 시간대를 다시 좁히거나 Q2 결과 캐싱 검토.

### 3.4 에러 처리

| HTTP 코드 | 처리 |
| --- | --- |
| 200 | 정상 |
| 400 | 쿼리 오류 → 슬랙 알람 + 배치 중단 |
| 401 | 인증 실패 → 슬랙 알람 + 배치 중단 |
| 429 | 할당량 초과 → 슬랙 알람, 다음 시간대 재시도 |
| 500 | 서버 오류 → 3회 재시도 후 슬랙 알람 |

## 4. 개발 백로그

### 4.1 우선순위 P0 (테스트 시작 필수)

| ID | 작업 | 추정 |
| --- | --- | --- |
| T-1 | `PlabApiClient` 모듈 구현 + 단위 테스트 | 0.5d |
| T-2 | 자체 DB 스키마 생성 | 0.2d |
| T-3 | 기준값 설정 화면 (F-1) + 프로모션 금액 매핑 (F-1B) | 0.5d |
| T-4 | 대상자 추출 배치 (F-2) - Q1, Q2 호출 | 1d |
| T-5 | 채널톡 복붙 발송 자료 생성 + 발송 관리 화면 (F-3) — 메시지 빌더/복사 카드 UI/pending·mark API | 0.5d |
| T-6 | 추천 페이지 백엔드 (F-4) - Q4 호출 | 0.5d |
| T-7 | 추천 페이지 프론트 | 0.5d |
| T-8 | 슬랙 webhook 알림 (F-5) - Q5 호출 | 0.3d |
| T-9 | 슬랙 이모지 수신 webhook (F-6) | 0.3d |
| T-10 | 이벤트 로깅 (전 기능 공통) | 0.2d |
| **합계 P0** | | **4.5d** |

### 4.2 우선순위 P1

| ID | 작업 | 추정 |
| --- | --- | --- |
| T-11 | 매치 결과 수집 배치 (F-7) - Q6 호출 | 0.3d |
| T-12 | Funnel 리포트 어드민 (F-8) | 1d |
| **합계 P1** | | **1.3d** |

### 4.3 의존성

```
T-1 (API Client) ──┬──→ T-4 (추출 배치) ──→ T-5 (비즈엠 발송) ──→ T-6 (페이지 BE) ──→ T-7 (페이지 FE)
                   │                                          │
                   └──→ T-11 (결과 수집)                      └──→ T-8 (슬랙 알림) ──→ T-9 (이모지 수신)
T-2 (DB) ─────────→ 전체 사전 작업
T-3 (설정 화면) ──── 독립적
T-10 (로깅) ──────── 전체에 분산
T-12 (리포트) ────── 데이터 누적 후
```

## 5. 비기능 요구사항

### 5.1 성능
- 배치 1회 실행: 5분 이내
- 추천 페이지 로드: 2초 이내
- 슬랙 알림 지연: 액션 후 10초 이내

### 5.2 보안
- 추천 페이지 토큰: HMAC 서명
- PLAB API 키: 환경변수 관리
- 슬랙 webhook URL: 환경변수 관리
- 매니저 phone 정보는 자체 DB에 저장하지 않고 **발송 관리 화면 조회 시점에만 PLAB에서 조회**하여 메모리에서 사용 (Q7). 화면에 표시된 번호는 식별용이며, 복붙 메시지 본문 자체에는 전화번호가 포함되지 않는다(매니저에게 노출되지 않음).

### 5.3 데이터 보존
- 테스트 종료 후 분석 완료 시점까지 자체 DB 보존
- 본 개발 결정 후 1개월 경과 시 자체 DB 폐기

## 6. 운영

### 6.1 운영자 SOP
[운영 매뉴얼](./운영매뉴얼-매니저매치이동.md) 참조 (발송 절차, 이동 요청 처리, 설정/리포트, 트러블슈팅)

### 6.2 테스트 시작 체크리스트
- [ ] PLAB API 키 발급 및 할당량 확인 (100회/일 이상 권장)
- [ ] 채널톡 발송 채널·계정 준비 및 메시지 내용 검수 완료
- [ ] 발송 관리 화면에서 복사 → 채널톡 붙여넣기 → 발송 리허설 1회 (소량)
- [ ] 슬랙 채널 생성 및 운영자 초대
- [ ] 기준값 초기 설정 (낮음=4, 높음=6)
- [ ] 프로모션 금액 매핑 입력 (test_type 3,6,7,8,9)
- [ ] 배치 dry-run 1회 (실 발송 없이 추출만)
- [ ] 추천 페이지 토큰 정상 동작 확인
- [ ] 운영자 SOP 숙지 ([운영 매뉴얼](./운영매뉴얼-매니저매치이동.md))

## 7. 확인 필요 항목

1. **PLAB API 일일 할당량** — API 키 발급 후 대시보드에서 확인 (v1.1 전체 시간 확장으로 60~80회/일 추정)
2. **채널톡 발송 메시지 검수** — `manager.phone`은 운영자가 채널톡에서 대상을 찾는 식별용. 채널톡 계정/발신 정책 확인
3. **이동 요청률 합격 임계값** — `[TBD]%` (의사결정 문서에 반영)
4. **테스트 시작 목표 일정** — 개발 P0 4.5일 + 검수 1.5일 = 약 6일
5. **발송 운영 주기** — 운영자가 발송 관리 화면을 확인하는 주기(권장: 매치 시작 1.5h 전 마감 역산). [운영 매뉴얼](./운영매뉴얼-매니저매치이동.md) 참조

## 부록: 핵심 PLAB DB 스키마 참조

본 시스템이 SQL 쿼리에서 사용하는 PLAB DB 테이블/컬럼.

### `plab.match`
- `id` (int, PK) — 매치 ID
- `schedule` (datetime) — 매치 시작 일시
- `status` (varchar(10)) — `release` / `cancel` / `hidden`
- `manager_id` (int, nullable) — 배정된 매니저 ID
- `manager_return` (tinyint) — `1`이면 양도 신청 중
- `before_manager_id` (int, nullable) — 양도 이력 (본 테스트에서 미사용)
- `stadium_id` (int)
- `test_type` (smallint) — `3, 6, 7, 8, 9`면 프로모션 매치
- `grade` (int, nullable) — 매치 등급(난이도). NULL은 미분류. 추출 통계의 등급 분포 집계에 사용

### `plab.match_apply`
- `match_id` (int)
- `status` (varchar(10)) — `confirm` / `cancel`

### `plab.stadium`
- `id` (int, PK)
- `group_id` (int) — stadium_group.id 참조

### `plab.stadium_group`
- `id` (int, PK)
- `name` (varchar(255))
- `area_id` (int) — 지역구 식별. area.id 참조

### `plab.area`
- `id` (int, PK)
- `name` (varchar(15))

### `plab.manager`
- `id` (int, PK)
- `name` (varchar(15))
- `phone` (varchar(20))
