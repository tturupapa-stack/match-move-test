import { describe, expect, it } from 'vitest';
import {
  formatKstDisplay,
  formatKstSqlDateTime,
  parseKstSqlDateTime,
  threeHoursLaterTopOfHour,
  tokenExpiryFromSchedule,
} from '../src/lib/time.js';

describe('time', () => {
  it('formats and parses a KST datetime roundtrip', () => {
    const s = '2026-05-20 19:00:00';
    const d = parseKstSqlDateTime(s);
    expect(formatKstSqlDateTime(d)).toBe(s);
  });

  it('formatKstDisplay trims seconds', () => {
    const d = parseKstSqlDateTime('2026-05-20 19:00:00');
    expect(formatKstDisplay(d)).toBe('2026-05-20 19:00');
  });

  it('threeHoursLaterTopOfHour produces a KST top-of-hour 3h ahead', () => {
    // 2026-05-20 15:42 KST → expect 2026-05-20 19:00 KST when adding 3h then truncating.
    const now = parseKstSqlDateTime('2026-05-20 15:42:00');
    const tgt = threeHoursLaterTopOfHour(now);
    expect(formatKstSqlDateTime(tgt)).toBe('2026-05-20 18:00:00');
  });

  it('tokenExpiry = schedule - 90m', () => {
    const sched = parseKstSqlDateTime('2026-05-20 19:00:00');
    const exp = tokenExpiryFromSchedule(sched);
    expect(formatKstSqlDateTime(exp)).toBe('2026-05-20 17:30:00');
  });
});
