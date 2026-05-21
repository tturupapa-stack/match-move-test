import { Router } from 'express';
import { z } from 'zod';
import { runExtractTargets } from '../../batch/extract-targets.js';
import { query } from '../../lib/db.js';
import type {
  AdminConfig,
  AdminSchedule,
  ApiOk,
  ManualExtractResult,
  PromotionMap,
} from '../../types/api.js';

export const adminConfigRouter: Router = Router();

const configUpdateSchema = z.object({
  lowThreshold: z.number().int().positive().max(50),
  highThreshold: z.number().int().positive().max(50),
  changedBy: z.string().max(64).optional(),
});

adminConfigRouter.get('/config', async (_req, res) => {
  const histRes = await query<{
    low_threshold: number;
    high_threshold: number;
    changed_by: string | null;
    changed_at: string;
  }>(
    `SELECT low_threshold, high_threshold, changed_by, changed_at::text
       FROM test_config ORDER BY id DESC LIMIT 50`,
  );
  const history = histRes.rows.map((r) => ({
    lowThreshold: r.low_threshold,
    highThreshold: r.high_threshold,
    changedBy: r.changed_by,
    changedAt: r.changed_at,
  }));
  const current = history[0] ?? { lowThreshold: 4, highThreshold: 6, changedBy: null, changedAt: '' };
  const data: AdminConfig = {
    current: { lowThreshold: current.lowThreshold, highThreshold: current.highThreshold },
    history,
  };
  res.json({ ok: true, data } satisfies ApiOk<AdminConfig>);
});

adminConfigRouter.put('/config', async (req, res) => {
  const parsed = configUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: 'invalid_body', message: parsed.error.message } });
  }
  if (parsed.data.lowThreshold > parsed.data.highThreshold) {
    return res.status(400).json({
      ok: false,
      error: { code: 'invalid_thresholds', message: 'lowThreshold must be <= highThreshold' },
    });
  }
  await query(
    `INSERT INTO test_config (low_threshold, high_threshold, changed_by) VALUES ($1, $2, $3)`,
    [parsed.data.lowThreshold, parsed.data.highThreshold, parsed.data.changedBy ?? null],
  );
  res.json({
    ok: true,
    data: {
      current: { lowThreshold: parsed.data.lowThreshold, highThreshold: parsed.data.highThreshold },
      history: [],
    } satisfies AdminConfig,
  });
});

// === extract-targets 운영 시간대 ===
const scheduleUpdateSchema = z.object({
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(0).max(23),
  enabled: z.boolean(),
  changedBy: z.string().max(64).optional(),
});

adminConfigRouter.get('/schedule', async (_req, res) => {
  const r = await query<{
    start_hour: number;
    end_hour: number;
    enabled: boolean;
    changed_by: string | null;
    changed_at: string;
  }>(
    `SELECT start_hour, end_hour, enabled, changed_by, changed_at::text
       FROM schedule_config WHERE job_name = 'extract-targets' ORDER BY id DESC LIMIT 50`,
  );
  const history = r.rows.map((row) => ({
    startHour: row.start_hour,
    endHour: row.end_hour,
    enabled: row.enabled,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
  }));
  const current = history[0] ?? { startHour: 0, endHour: 23, enabled: true };
  const data: AdminSchedule = {
    current: { startHour: current.startHour, endHour: current.endHour, enabled: current.enabled },
    history,
  };
  res.json({ ok: true, data } satisfies ApiOk<AdminSchedule>);
});

adminConfigRouter.put('/schedule', async (req, res) => {
  const parsed = scheduleUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: 'invalid_body', message: parsed.error.message } });
  }
  const { startHour, endHour, enabled, changedBy } = parsed.data;
  await query(
    `INSERT INTO schedule_config (job_name, start_hour, end_hour, enabled, changed_by)
     VALUES ('extract-targets', $1, $2, $3, $4)`,
    [startHour, endHour, enabled, changedBy ?? null],
  );
  res.json({
    ok: true,
    data: { current: { startHour, endHour, enabled }, history: [] } satisfies AdminSchedule,
  });
});

const promotionUpdateSchema = z.object({
  entries: z.array(
    z.object({
      testType: z.number().int().min(0).max(99),
      amount: z.number().int().min(0).max(10_000_000),
    }),
  ),
  updatedBy: z.string().max(64).optional(),
});

adminConfigRouter.get('/promotion-map', async (_req, res) => {
  const r = await query<{ test_type: number; amount: number; updated_by: string | null; updated_at: string }>(
    `SELECT test_type, amount, updated_by, updated_at::text FROM promotion_amount_map ORDER BY test_type ASC`,
  );
  const data: PromotionMap = r.rows.map((row) => ({
    testType: row.test_type,
    amount: row.amount,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  }));
  res.json({ ok: true, data });
});

adminConfigRouter.put('/promotion-map', async (req, res) => {
  const parsed = promotionUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: 'invalid_body', message: parsed.error.message } });
  }
  for (const e of parsed.data.entries) {
    await query(
      `INSERT INTO promotion_amount_map (test_type, amount, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (test_type) DO UPDATE SET amount = EXCLUDED.amount, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [e.testType, e.amount, parsed.data.updatedBy ?? null],
    );
  }
  res.json({ ok: true, data: { count: parsed.data.entries.length } });
});

// === 수동 추출 실행 (테스트용) ===
const runExtractSchema = z.object({
  targetSchedule: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, "형식: 'YYYY-MM-DD HH:00:00'")
    .optional(),
  lowThreshold: z.number().int().positive().max(50).optional(),
  highThreshold: z.number().int().positive().max(50).optional(),
  dryRun: z.boolean().optional().default(true),
});

/**
 * POST /api/admin/run-extract — 매치 시각·기준값을 지정해 추출 배치를 수동 실행한다.
 * dryRun(기본 true)이면 DB 저장·슬랙 발송 없이 미리보기만 반환한다.
 */
adminConfigRouter.post('/run-extract', async (req, res) => {
  const parsed = runExtractSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: { code: 'invalid_body', message: parsed.error.message } });
  }
  const { targetSchedule, lowThreshold, highThreshold, dryRun } = parsed.data;
  if (lowThreshold != null && highThreshold != null && lowThreshold > highThreshold) {
    return res.status(400).json({
      ok: false,
      error: { code: 'invalid_thresholds', message: '낮음 기준은 높음 기준보다 클 수 없습니다.' },
    });
  }
  try {
    const summary = await runExtractTargets({ targetSchedule, lowThreshold, highThreshold, dryRun });
    res.json({ ok: true, data: summary } satisfies ApiOk<ManualExtractResult>);
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: { code: 'extract_failed', message: err instanceof Error ? err.message : String(err) },
    });
  }
});
