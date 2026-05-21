# Express API + 매시 정각 cron 배치(server) 배포용 — monorepo에서 server만 빌드/실행.
# Railway / Render / Fly 등 Dockerfile 지원 호스팅에서 사용.
FROM node:22-slim

WORKDIR /app

# workspace 매니페스트 먼저 복사 (레이어 캐시)
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/

# 전체 워크스페이스 설치 (server 빌드에 필요한 devDeps 포함)
RUN npm install

# 소스 복사 후 server만 빌드
COPY server ./server
COPY scripts ./scripts
COPY migrations ./migrations
RUN npm run -w server build

ENV NODE_ENV=production
# 호스팅이 PORT 환경변수를 주입 (server는 env.PORT 사용). .env 파일은 없으며 환경변수로 주입한다.
# dotenv override는 .env 파일이 없으면 no-op이므로 호스팅 환경변수가 그대로 적용된다.
CMD ["node", "server/dist/index.js"]
