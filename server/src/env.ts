import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// 셸 환경에 빈/오염된 값(예: 하네스가 주입한 SLACK_WEBHOOK_URL='')이 있어도 .env가 우선하도록
// override 로드한다. Node --env-file은 기존 환경변수를 덮어쓰지 못하므로 dotenv override를 사용.
// 테스트는 vitest가 NODE_ENV=test로 설정하므로 .env를 적용하지 않는다(기본값 사용).
if (process.env.NODE_ENV !== 'test') {
  const here = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.resolve(here, '../../.env'), override: true });
}

const schema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres')),
  PLAB_API_BASE_URL: z.string().url(),
  PLAB_API_KEY: z.string().min(1),

  SLACK_WEBHOOK_URL: z.string().default(''),
  SLACK_SIGNING_SECRET: z.string().default(''),
  SLACK_CHANNEL: z.string().default('#match-move-test'),

  HMAC_SECRET: z.string().min(32, 'HMAC_SECRET must be ≥32 chars'),

  TZ: z.string().default('Asia/Seoul'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('4000')
    .transform((v) => Number.parseInt(v, 10)),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  // In test environments, provide sensible defaults so unit tests don't need a real .env
  if (source.NODE_ENV === 'test') {
    const filled: Record<string, string | undefined> = {
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      PLAB_API_BASE_URL: 'https://vibe.techin.pe.kr/api',
      PLAB_API_KEY: 'test-key',
      HMAC_SECRET: 'a'.repeat(32),
      ...source,
    };
    const parsed = schema.parse(filled);
    cached = parsed;
    return parsed;
  }
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('[env] invalid configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration. See logs above.');
  }
  cached = parsed.data;
  return parsed.data;
}

export function resetEnvCache(): void {
  cached = null;
}
