import { describe, expect, it } from 'vitest';
import { makeToken, verifyToken } from '../src/lib/token.js';

const SECRET = 'a'.repeat(40);

describe('token', () => {
  it('roundtrips and verifies a fresh token', () => {
    const exp = new Date(Date.now() + 60_000).toISOString();
    const tok = makeToken({ tid: 42, exp }, SECRET);
    const r = verifyToken(tok, SECRET);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.tid).toBe(42);
      expect(r.payload.exp).toBe(exp);
    }
  });

  it('rejects tampered signature', () => {
    const exp = new Date(Date.now() + 60_000).toISOString();
    const tok = makeToken({ tid: 1, exp }, SECRET);
    const tampered = tok.slice(0, -1) + (tok.endsWith('A') ? 'B' : 'A');
    const r = verifyToken(tampered, SECRET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_signature');
  });

  it('rejects malformed token', () => {
    const r = verifyToken('not.a.real.token', SECRET);
    expect(r.ok).toBe(false);
  });

  it('rejects with wrong secret', () => {
    const tok = makeToken({ tid: 1, exp: new Date(Date.now() + 60_000).toISOString() }, SECRET);
    const r = verifyToken(tok, 'b'.repeat(40));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_signature');
  });

  it('reports expired when past exp', () => {
    const tok = makeToken({ tid: 7, exp: new Date(Date.now() - 60_000).toISOString() }, SECRET);
    const r = verifyToken(tok, SECRET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('expired');
  });

  it('applies margin (60s) — rejects within margin', () => {
    const exp = new Date(Date.now() + 30_000).toISOString();
    const tok = makeToken({ tid: 7, exp }, SECRET);
    const r = verifyToken(tok, SECRET, { marginSeconds: 60 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('expired');
  });

  it('skipExpiry returns payload even when expired', () => {
    const tok = makeToken({ tid: 99, exp: new Date(Date.now() - 1000).toISOString() }, SECRET);
    const r = verifyToken(tok, SECRET, { skipExpiry: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.tid).toBe(99);
  });
});
