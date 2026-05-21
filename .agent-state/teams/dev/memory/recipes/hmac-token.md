# Recipe: HMAC short-lived token (link tokens)

## When to use
이메일/카카오톡 등 외부 채널의 클릭 링크에 사용자/매치 식별자를 안전하게 실어야 할 때. JWT 라이브러리 도입 없이 일회용/단순용 토큰.

## 핵심 구현

```ts
export type TokenPayload = { tid: number; exp: string /* ISO8601 */ };

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function makeToken(payload: TokenPayload, secret: string): string {
  const json = JSON.stringify(payload);
  const encoded = b64urlEncode(Buffer.from(json));
  const sig = b64urlEncode(createHmac('sha256', secret).update(json).digest());
  return `${encoded}.${sig}`;
}

export function verifyToken(token: string, secret: string, opts?: { marginSeconds?: number; skipExpiry?: boolean }) {
  // 1) split into [encoded, sig]; reject if malformed
  // 2) decode encoded → JSON
  // 3) recompute HMAC sig; compare with timingSafeEqual
  // 4) parse payload, check exp - marginSeconds against now
}
```

## Tests (must-have)
- 정상 roundtrip
- 서명 변조 → bad_signature
- 다른 secret → bad_signature
- exp 이전 → ok
- exp 직후 → expired
- margin 60s 내부 → expired (조기 거절)
- skipExpiry → payload 추출 가능 (로깅 용도)

## Why not JWT
- 일회용 시스템에서 JWT의 alg/header/kid 메타데이터 불필요.
- `timingSafeEqual`만 잘 쓰면 충분히 안전.
- 외부 의존 줄임.
