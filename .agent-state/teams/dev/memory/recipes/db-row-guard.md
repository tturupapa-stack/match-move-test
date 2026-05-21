# Recipe: pg + noUncheckedIndexedAccess row guard

`strict` + `noUncheckedIndexedAccess` TypeScript 설정에서 pg `QueryResult.rows[0]`는 `T | undefined`. 매번 명시적 가드.

## 안전 패턴

```ts
const res = await query<{ id: number }>('INSERT ... RETURNING id', [...]);
const row = res.rows[0];
if (!row) throw new Error('insert did not return a row');
return { id: row.id };
```

## 가드 헬퍼 (선택)

```ts
function requireOne<T>(rows: T[], msg: string): T {
  const r = rows[0];
  if (!r) throw new Error(msg);
  return r;
}
```

## 안티 패턴
- `res.rows[0]!`: 컴파일은 되지만 RETURNING 미동작 시 silent crash.
- `res.rows[0].id`: TS2532 "Object is possibly 'undefined'" 빌드 실패.
