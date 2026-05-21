# Recipe: PLAB SQL Gateway client

## When to use
PLAB Playground의 `/api/query` 엔드포인트(X-API-Key + prepared statement params)와 연동할 때.

## 핵심 패턴

```ts
export class PlabApiClient {
  constructor(private readonly opts: { baseUrl: string; apiKey: string; fetchImpl?: typeof fetch; maxRetries?: number; backoffMs?: number; timeoutMs?: number }) {}

  async executeSql<Row>(sql: string, params: unknown[] = []): Promise<{ rows: Row[] }> {
    let attempt = 0;
    while (attempt <= this.maxRetries) {
      // AbortController + timeout
      // POST { sql, params } with X-API-Key
      // status 400/401 → throw immediately (non-retryable)
      // status 429 → throw immediately (quota — caller decides)
      // status 5xx → backoff (500ms * 2^attempt) and retry
      // 200 → return rows
    }
  }

  // High-level helpers wrap executeSql with typed return + the SQL string baked in.
  async q1ExtractTargetMatches(args) { ... }   // uses backtick `match`
  async q4RefetchMatches(matchIds: number[]) { /* short-circuits when empty */ }
}
```

## Tests (must-have)
- 400/401/429 즉시 throw, 재시도 안 함
- 5xx maxRetries+1 회 시도
- 5xx → 200 회복 시 정상 반환
- `match` 테이블 SQL에 백틱 포함 (regex assertion)
- Q4 빈 리스트 입력 시 fetch 호출 안 됨

## Gotchas
- MySQL의 `match`는 예약어 — `` `match` ``로 감싸지 않으면 syntax error → 400.
- `HAVING` 절은 group 함수 없을 때 MySQL 허용 (subquery alias 필터링용). PostgreSQL에서는 안 됨.
- API rate limit 도달 시 보통 다음 시간대로 미루는 게 안전 (배치 멱등성 가정).
