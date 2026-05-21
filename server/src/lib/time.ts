// KST helpers. process.env.TZ should be 'Asia/Seoul' for predictable behavior.

const KST_OFFSET_MIN = 9 * 60;

export function nowUtc(): Date {
  return new Date();
}

function pad(n: number, width = 2): string {
  return n.toString().padStart(width, '0');
}

/**
 * Convert a Date (any source) to KST components.
 */
function toKstComponents(d: Date): {
  y: number;
  m: number;
  day: number;
  h: number;
  min: number;
  s: number;
} {
  // Use Intl for correctness — avoids manual DST/leap quirks.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    day: Number(parts.day),
    h: Number(parts.hour === '24' ? '00' : parts.hour),
    min: Number(parts.minute),
    s: Number(parts.second),
  };
}

/**
 * Current hour (0-23) in KST for a given Date.
 */
export function kstHour(d: Date = nowUtc()): number {
  return toKstComponents(d).h;
}

/**
 * Format a Date as KST 'YYYY-MM-DD HH:mm:ss' — the format PLAB Q1 expects for `schedule = ?`.
 */
export function formatKstSqlDateTime(d: Date): string {
  const c = toKstComponents(d);
  return `${c.y}-${pad(c.m)}-${pad(c.day)} ${pad(c.h)}:${pad(c.min)}:${pad(c.s)}`;
}

/**
 * Format a Date as KST 'YYYY-MM-DD HH:mm' (UI display).
 */
export function formatKstDisplay(d: Date): string {
  const c = toKstComponents(d);
  return `${c.y}-${pad(c.m)}-${pad(c.day)} ${pad(c.h)}:${pad(c.min)}`;
}

/**
 * Format a Date as UTC 'YYYY-MM-DD HH:mm:ss' — PLAB DB가 schedule을 UTC로 저장하므로
 * `schedule = ?` 비교에는 반드시 이 형식을 사용한다 (KST 문자열로 비교하면 9시간 어긋남).
 */
export function formatUtcSqlDateTime(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * Parse a PLAB DB schedule value (UTC) into a Date.
 * PLAB은 ISO('...Z') 또는 'YYYY-MM-DD HH:mm:ss'(UTC)로 반환한다.
 */
export function parseDbSchedule(s: string): Date {
  if (s.includes('T')) {
    // ISO 8601 (보통 'Z' 포함). 그대로 파싱.
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) throw new Error(`invalid db schedule: ${s}`);
    return d;
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2}):(\d{2})/);
  if (!m) throw new Error(`invalid db schedule: ${s}`);
  const [, y, mo, d, h, mi, se] = m;
  return new Date(Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +se!));
}

/**
 * Compute the KST hour-start scheduled `now + 3h` (PRD: 3시간 후 정시 매치).
 * Returns the Date pointing at that instant in absolute time (UTC underneath).
 */
export function threeHoursLaterTopOfHour(now: Date = nowUtc()): Date {
  const target = new Date(now.getTime() + 3 * 3600 * 1000);
  // Truncate to top-of-hour in KST. To do this safely, format → reparse with min/sec=0.
  const c = toKstComponents(target);
  // Reconstruct UTC Date from KST components with minutes/seconds zeroed.
  // KST = UTC+9, so the UTC moment that *displays* as `YYYY-MM-DD HH:00:00 KST` is `Date.UTC(y,m-1,d,h,0,0) - 9h`.
  const utcMs = Date.UTC(c.y, c.m - 1, c.day, c.h, 0, 0) - KST_OFFSET_MIN * 60_000;
  return new Date(utcMs);
}

/**
 * Parse a PLAB DB-style 'YYYY-MM-DD HH:mm:ss' (assumed KST) into a UTC Date.
 */
export function parseKstSqlDateTime(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) throw new Error(`invalid KST datetime: ${s}`);
  const [, y, mo, d, h, mi, se] = m;
  const utcMs = Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +se!) - KST_OFFSET_MIN * 60_000;
  return new Date(utcMs);
}

/**
 * Token expiry = match schedule - 1h30m. (PRD §2.5)
 */
export function tokenExpiryFromSchedule(schedule: Date): Date {
  return new Date(schedule.getTime() - 90 * 60 * 1000);
}
