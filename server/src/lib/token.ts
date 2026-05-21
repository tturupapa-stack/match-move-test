import { createHmac, timingSafeEqual } from 'node:crypto';

export type TokenPayload = {
  tid: number; // targets.id
  exp: string; // ISO8601 UTC
};

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(s: string): Buffer {
  // Re-pad.
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const std = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(std, 'base64');
}

function sign(payloadJson: string, secret: string): string {
  return b64urlEncode(createHmac('sha256', secret).update(payloadJson).digest());
}

export function makeToken(payload: TokenPayload, secret: string): string {
  const json = JSON.stringify(payload);
  const encoded = b64urlEncode(Buffer.from(json, 'utf8'));
  const sig = sign(json, secret);
  return `${encoded}.${sig}`;
}

export type VerifyResult =
  | { ok: true; payload: TokenPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'invalid_payload' };

/**
 * Verify token integrity and (unless `skipExpiry`) check the embedded `exp`.
 * `marginSeconds` (ADR-001): treat as expired if `now > exp - marginSeconds`.
 */
export function verifyToken(
  token: string,
  secret: string,
  opts: { now?: Date; marginSeconds?: number; skipExpiry?: boolean } = {},
): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [encoded, sig] = parts;
  if (!encoded || !sig) return { ok: false, reason: 'malformed' };

  let json: string;
  try {
    json = b64urlDecode(encoded).toString('utf8');
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const expectedSig = sign(json, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let payload: TokenPayload;
  try {
    const parsed = JSON.parse(json) as TokenPayload;
    if (typeof parsed.tid !== 'number' || typeof parsed.exp !== 'string') {
      return { ok: false, reason: 'invalid_payload' };
    }
    payload = parsed;
  } catch {
    return { ok: false, reason: 'invalid_payload' };
  }

  if (!opts.skipExpiry) {
    const now = (opts.now ?? new Date()).getTime();
    const exp = new Date(payload.exp).getTime();
    const margin = (opts.marginSeconds ?? 0) * 1000;
    if (Number.isNaN(exp)) return { ok: false, reason: 'invalid_payload' };
    if (now > exp - margin) return { ok: false, reason: 'expired' };
  }

  return { ok: true, payload };
}
