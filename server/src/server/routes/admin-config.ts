import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../lib/db.js';
import type {
  AdminConfig,
  ApiOk,
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
  if (parsed.data.lowThreshold >= parsed.data.highThreshold) {
    return res.status(400).json({
      ok: false,
      error: { code: 'invalid_thresholds', message: 'lowThreshold must be < highThreshold' },
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
