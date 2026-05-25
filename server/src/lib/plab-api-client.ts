import { EXTRACTION_EXCLUDED_MANAGER_IDS, UNASSIGNED_MANAGER_ID } from './constants.js';
import { log } from './logger.js';

/**
 * PLAB SQL Gateway client.
 * Endpoint: POST {baseUrl}/query  with header X-API-Key.
 * Request body : { query: string, params: unknown[] }
 * Response body: { success: boolean, data: Row[], rowCount: number, executionTime: string, error?: string }
 *
 * IMPORTANT: `match` is a MySQL reserved word — wrap with backticks in SQL.
 */

export class PlabApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'PlabApiError';
  }
}

/** Normalized response surfaced to callers. PLAB's `data` is mapped to `rows`. */
export interface SqlQueryResponse<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount?: number;
  executionTime?: string;
}

/** Raw PLAB SQL Gateway response shape. */
interface PlabRawResponse<Row = Record<string, unknown>> {
  success: boolean;
  data?: Row[];
  rowCount?: number;
  executionTime?: string;
  error?: string;
}

type FetchLike = typeof fetch;

export interface PlabApiClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Override fetch (for tests). */
  fetchImpl?: FetchLike;
  /** Max retries on 500. Default 3. */
  maxRetries?: number;
  /** Base backoff in ms. Default 500. */
  backoffMs?: number;
  /** Timeout per request in ms. Default 10s. */
  timeoutMs?: number;
}

export class PlabApiClient {
  private fetchImpl: FetchLike;
  private maxRetries: number;
  private backoffMs: number;
  private timeoutMs: number;

  constructor(private readonly opts: PlabApiClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
    this.maxRetries = opts.maxRetries ?? 3;
    this.backoffMs = opts.backoffMs ?? 500;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  /** Low-level: execute arbitrary SQL with parameters. */
  async executeSql<Row = Record<string, unknown>>(
    sql: string,
    params: ReadonlyArray<unknown> = [],
  ): Promise<SqlQueryResponse<Row>> {
    const url = `${this.opts.baseUrl.replace(/\/$/, '')}/query`;
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= this.maxRetries) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.opts.apiKey,
          },
          body: JSON.stringify({ query: sql, params }),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.ok) {
          const raw = (await res.json()) as PlabRawResponse<Row>;
          if (!raw || typeof raw.success !== 'boolean') {
            throw new PlabApiError('Malformed PLAB response (missing success)', res.status, raw);
          }
          if (!raw.success) {
            throw new PlabApiError(
              `PLAB application error: ${raw.error ?? '(no message)'}`,
              res.status,
              raw,
            );
          }
          if (!Array.isArray(raw.data)) {
            throw new PlabApiError('Malformed PLAB response (missing data[])', res.status, raw);
          }
          return { rows: raw.data, rowCount: raw.rowCount, executionTime: raw.executionTime };
        }

        // Non-2xx
        const text = await res.text().catch(() => '');
        if (res.status === 400 || res.status === 401) {
          throw new PlabApiError(`PLAB ${res.status} (non-retryable): ${text}`, res.status, text);
        }
        if (res.status === 429) {
          throw new PlabApiError(`PLAB 429 quota: ${text}`, res.status, text);
        }
        if (res.status >= 500) {
          lastError = new PlabApiError(`PLAB ${res.status}: ${text}`, res.status, text);
          // fall through to retry
        } else {
          throw new PlabApiError(`PLAB unexpected ${res.status}: ${text}`, res.status, text);
        }
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof PlabApiError && (err.status === 400 || err.status === 401 || err.status === 429)) {
          throw err;
        }
        lastError = err;
      }

      attempt += 1;
      if (attempt > this.maxRetries) break;
      const wait = this.backoffMs * 2 ** (attempt - 1);
      log.warn('plab retry', { attempt, wait_ms: wait });
      await new Promise((r) => setTimeout(r, wait));
    }

    throw lastError instanceof Error
      ? lastError
      : new PlabApiError('PLAB unknown failure', 0, lastError);
  }

  // ─── Q1: 대상 매치 추출 ───
  // 지역 매칭 단위 = filter_area (stadium_group.filter_area_id). 세부 area보다 넓어
  // 추천 후보 풀이 커진다. 출력 alias는 다운스트림 호환을 위해 area_id/area_name 유지.
  async q1ExtractTargetMatches(args: {
    targetSchedule: string; // 'YYYY-MM-DD HH:00:00' KST
    lowThreshold: number;
  }): Promise<
    Array<{
      match_id: number;
      schedule: string;
      manager_id: number;
      stadium_id: number;
      area_id: number;
      area_name: string | null;
      stadium_name: string;
      manager_name: string;
      manager_phone: string;
      participant_count: number;
    }>
  > {
    const sql = `
      SELECT
        m.id AS match_id,
        m.schedule,
        m.manager_id,
        m.stadium_id,
        sg.filter_area_id AS area_id,
        fa.name AS area_name,
        sg.name AS stadium_name,
        mgr.name AS manager_name,
        mgr.phone AS manager_phone,
        (SELECT COUNT(*) FROM match_apply ma
         WHERE ma.match_id = m.id AND ma.status = 'confirm') AS participant_count
      FROM \`match\` m
      JOIN stadium s ON m.stadium_id = s.id
      JOIN stadium_group sg ON s.group_id = sg.id
      LEFT JOIN filter_area fa ON sg.filter_area_id = fa.id
      JOIN manager mgr ON m.manager_id = mgr.id
      WHERE m.status = 'release'
        AND m.manager_id IS NOT NULL
        AND m.manager_id NOT IN (${EXTRACTION_EXCLUDED_MANAGER_IDS.join(', ')})
        AND m.manager_return = 0
        AND m.schedule = ?
        AND MINUTE(m.schedule) = 0
      HAVING participant_count < ?
    `;
    const res = await this.executeSql(sql, [args.targetSchedule, args.lowThreshold]);
    return res.rows as never;
  }

  // ─── Q2: 추천 매치 검색 ───
  // 같은 filter_area(넓은 지역 단위) 안에서 추천 매치를 찾는다. areaId 인자엔
  // Q1이 반환한 filter_area_id가 그대로 들어온다(이름만 area로 유지).
  async q2FindRecommendations(args: {
    targetSchedule: string;
    areaId: number;
    highThreshold: number;
  }): Promise<
    Array<{
      match_id: number;
      schedule: string;
      stadium_id: number;
      stadium_name: string;
      area_id: number;
      manager_return: number;
      test_type: number | null;
      participant_count: number;
    }>
  > {
    const sql = `
      SELECT
        m.id AS match_id,
        m.schedule,
        m.stadium_id,
        sg.name AS stadium_name,
        sg.filter_area_id AS area_id,
        m.manager_return,
        m.test_type,
        (SELECT COUNT(*) FROM match_apply ma
         WHERE ma.match_id = m.id AND ma.status = 'confirm') AS participant_count
      FROM \`match\` m
      JOIN stadium s ON m.stadium_id = s.id
      JOIN stadium_group sg ON s.group_id = sg.id
      WHERE m.status = 'release'
        AND (m.manager_id IS NULL OR m.manager_id = ${UNASSIGNED_MANAGER_ID} OR m.manager_return = 1)
        AND m.schedule = ?
        AND sg.filter_area_id = ?
      HAVING participant_count >= ?
    `;
    const res = await this.executeSql(sql, [args.targetSchedule, args.areaId, args.highThreshold]);
    return res.rows as never;
  }

  // ─── Q4: 추천 매치 최신 상태 재조회 ───
  async q4RefetchMatches(matchIds: number[]): Promise<
    Array<{
      id: number;
      status: string;
      manager_id: number | null;
      manager_return: number;
      participant_count: number;
    }>
  > {
    if (matchIds.length === 0) return [];
    const placeholders = matchIds.map(() => '?').join(', ');
    const sql = `
      SELECT
        m.id, m.status, m.manager_id, m.manager_return,
        (SELECT COUNT(*) FROM match_apply ma
         WHERE ma.match_id = m.id AND ma.status = 'confirm') AS participant_count
      FROM \`match\` m
      WHERE m.id IN (${placeholders})
    `;
    const res = await this.executeSql(sql, matchIds);
    return res.rows as never;
  }

  // ─── Q5: 양도/프로모션 여부 + 실시간 배정 상태 (action 시점 마감 판정) ───
  async q5MatchTags(matchId: number): Promise<{
    id: number;
    status: string;
    manager_id: number | null;
    manager_return: number;
    test_type: number | null;
  } | null> {
    const sql = 'SELECT id, status, manager_id, manager_return, test_type FROM `match` WHERE id = ?';
    const res = await this.executeSql<{
      id: number;
      status: string;
      manager_id: number | null;
      manager_return: number;
      test_type: number | null;
    }>(sql, [matchId]);
    return res.rows[0] ?? null;
  }

  // ─── Q6: 매치 결과 ───
  async q6MatchResults(matchIds: number[]): Promise<
    Array<{ id: number; status: string; final_participant_count: number }>
  > {
    if (matchIds.length === 0) return [];
    const placeholders = matchIds.map(() => '?').join(', ');
    const sql = `
      SELECT
        m.id, m.status,
        (SELECT COUNT(*) FROM match_apply ma
         WHERE ma.match_id = m.id AND ma.status = 'confirm') AS final_participant_count
      FROM \`match\` m
      WHERE m.id IN (${placeholders})
    `;
    const res = await this.executeSql(sql, matchIds);
    return res.rows as never;
  }

  // ─── 매니저 연락처 조회 (엑셀 발송 시점에만 호출, 자체 DB 미저장 — PRD §5.2) ───
  async qManagerPhones(managerIds: number[]): Promise<Array<{ id: number; phone: string }>> {
    if (managerIds.length === 0) return [];
    const placeholders = managerIds.map(() => '?').join(', ');
    const sql = `SELECT id, phone FROM manager WHERE id IN (${placeholders})`;
    const res = await this.executeSql<{ id: number; phone: string }>(sql, managerIds);
    return res.rows;
  }
}

export function createPlabClient(env: { PLAB_API_BASE_URL: string; PLAB_API_KEY: string }): PlabApiClient {
  return new PlabApiClient({ baseUrl: env.PLAB_API_BASE_URL, apiKey: env.PLAB_API_KEY });
}
