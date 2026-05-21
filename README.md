# Match Move Test System

매니저 매치 이동 가설 검증 일회용 시스템.

## 셋업

```sh
npm install
cp .env.example .env  # 채우기 (특히 DATABASE_URL, HMAC_SECRET)
npm run -w server migrate
npm run dev           # server (4000) + web (3000) 동시 실행
```

## 빌드 / 테스트

```sh
npm run build         # server + web
npm run -w server test
npm run -w server dry-run   # 실 발송 없이 추출 흐름 검증
```

자세한 설계는 `DESIGN.md` 참조.
