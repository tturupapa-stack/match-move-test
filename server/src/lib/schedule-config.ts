// 배치 운영 시간대 설정 — schedule_config 최신 행이 현재값(append-only).
import { query } from './db.js';

export interface ScheduleConfig {
  startHour: number; // 0-23
  endHour: number; // 0-23
  enabled: boolean;
}

// seed가 없을 때의 안전 기본값: 24시간 동작(기존 동작 유지).
const DEFAULT_SCHEDULE: ScheduleConfig = { startHour: 0, endHour: 23, enabled: true };

/**
 * 지정 배치의 현재 운영 시간대 설정을 읽는다. 행이 없으면 24시간 기본값.
 */
export async function loadScheduleConfig(jobName: string): Promise<ScheduleConfig> {
  const res = await query<{ start_hour: number; end_hour: number; enabled: boolean }>(
    `SELECT start_hour, end_hour, enabled
       FROM schedule_config WHERE job_name = $1 ORDER BY id DESC LIMIT 1`,
    [jobName],
  );
  const row = res.rows[0];
  if (!row) return DEFAULT_SCHEDULE;
  return { startHour: row.start_hour, endHour: row.end_hour, enabled: row.enabled };
}

/**
 * 시각(0-23)이 운영 시간대 안인지. start<=end는 일반 범위, start>end는 자정 넘김(예: 22~06).
 */
export function isHourWithinWindow(hour: number, startHour: number, endHour: number): boolean {
  if (startHour <= endHour) return hour >= startHour && hour <= endHour;
  return hour >= startHour || hour <= endHour;
}
