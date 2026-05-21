# 배포 가이드

> web(Next.js)은 **Vercel**, server(Express + 매시 cron)는 **Railway**(상시 가동 필요)로 분리 배포한다.

## 현재 상태
- web: Vercel 배포 완료 → https://match-move-test.vercel.app
- server: 미배포 (이 문서대로 Railway 배포)

---

## 1. server → Railway 배포 (사용자 작업)

cron 배치가 멈추지 않으려면 상시 가동 인스턴스가 필요하다. Render 무료 tier는 유휴 sleep으로 cron이 멈추므로 **Railway 권장**.

### 단계
1. https://railway.app → 로그인 → **New Project** → **Deploy from GitHub repo**
2. `tturupapa-stack/match-move-test` 선택
3. Railway가 루트 **Dockerfile**을 자동 감지해 빌드 (server만 빌드/실행)
4. **Variables** 탭에서 아래 환경변수 입력 (값은 로컬 `.env` 참고)
5. **Settings → Networking → Generate Domain** 으로 공개 URL 발급 (예: `https://match-move-test-production.up.railway.app`)
6. (선택) **Settings → Healthcheck Path** = `/healthz`

### server 환경변수 (Railway Variables)
| 키 | 값 |
|---|---|
| `DATABASE_URL` | (로컬 .env의 Supabase Session pooler URL 그대로) |
| `PLAB_API_BASE_URL` | `https://vibe.techin.pe.kr/api` |
| `PLAB_API_KEY` | (로컬 .env 값) |
| `HMAC_SECRET` | (로컬 .env 값 — 32자+) |
| `SLACK_WEBHOOK_URL` | (로컬 .env 값) |
| `SLACK_CHANNEL` | `#match-move-test` |
| `SLACK_SIGNING_SECRET` | (이모지 수신 쓸 때만, 아니면 비움) |
| `TZ` | `Asia/Seoul` |
| `NODE_ENV` | `production` |
| `PUBLIC_BASE_URL` | `https://match-move-test.vercel.app` ← 매니저가 보는 web 주소 (슬랙·메시지 링크 base) |

> `PORT`는 Railway가 자동 주입하므로 설정 불필요. `.env` 파일은 배포에 포함되지 않으며(.dockerignore), 위 Variables가 적용된다.

> **DB는 이미 마이그레이션 완료**(로컬에서 동일 Supabase에 적용). 같은 `DATABASE_URL`을 쓰면 스키마 재생성 불필요.

---

## 2. Vercel(web) ↔ server 연결 (server URL 발급 후)

server 공개 URL이 나오면 Vercel에 아래 환경변수를 추가하고 web을 재배포한다. **(이 단계는 Claude가 대신 수행 가능 — server URL만 알려주면 됨)**

| Vercel 환경변수 | 값 |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://<railway-server-url>` (클라이언트 fetch) |
| `API_BASE_URL` | `https://<railway-server-url>` (SSR fetch) |

`NEXT_PUBLIC_*`는 빌드 타임에 임베드되므로 **환경변수 추가 후 web 재배포 필수**.

---

## 3. ⚠️ 배포 후 로컬 server 종료

배포 server와 로컬 server(Claude Preview)가 **같은 Supabase DB**에 동시에 cron을 돌리면 **중복 추출·중복 슬랙 알림**이 발생한다. 배포가 정상 동작하면 로컬 server preview를 끌 것.

---

## 4. 배포 후 검증 체크리스트
- [ ] `https://<railway>/healthz` → 200
- [ ] `https://<railway>/api/admin/config` → seed JSON
- [ ] Vercel `https://match-move-test.vercel.app/admin/config` → 500 아님 (server 연결됨)
- [ ] 슬랙 추출 알림의 링크가 `match-move-test.vercel.app` 가리킴
- [ ] 추천 페이지 링크(`/match-move?t=...`)가 매니저 환경에서 데이터 로드됨
