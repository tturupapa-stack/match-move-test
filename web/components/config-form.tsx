'use client';

import { useState } from 'react';
import { clientFetch, type AdminConfig, type PromotionMap } from '../lib/api';

export function ConfigForm({
  initial,
  initialPromotionMap,
}: {
  initial: AdminConfig;
  initialPromotionMap: PromotionMap;
}) {
  const [low, setLow] = useState(initial.current.lowThreshold);
  const [high, setHigh] = useState(initial.current.highThreshold);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [pm, setPm] = useState<Array<{ testType: number; amount: number }>>(() => {
    const map = new Map(initialPromotionMap.map((p) => [p.testType, p.amount]));
    return [3, 6, 7, 8, 9].map((t) => ({ testType: t, amount: map.get(t) ?? 0 }));
  });

  const saveConfig = async () => {
    setErr(null);
    if (low > high) {
      setErr('낮음 기준은 높음 기준보다 클 수 없습니다.');
      return;
    }
    setSaving(true);
    const r = await clientFetch<{ current: { lowThreshold: number; highThreshold: number } }>(
      '/api/admin/config',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lowThreshold: low, highThreshold: high, changedBy: 'admin-ui' }),
      },
    );
    setSaving(false);
    if (r.ok) setSavedAt(new Date().toISOString());
    else setErr(r.error.message);
  };

  const savePromotionMap = async () => {
    setErr(null);
    setSaving(true);
    const r = await clientFetch('/api/admin/promotion-map', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: pm, updatedBy: 'admin-ui' }),
    });
    setSaving(false);
    if (r.ok) setSavedAt(new Date().toISOString());
    else setErr(r.error.message);
  };

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">진행가능성 기준값 (F-1)</h2>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm text-muted">낮음 기준 (참가자 수 미만)</span>
            <input
              type="number"
              min={1}
              max={50}
              value={low}
              onChange={(e) => setLow(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm text-muted">높음 기준 (참가자 수 이상)</span>
            <input
              type="number"
              min={1}
              max={50}
              value={high}
              onChange={(e) => setHigh(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted">
          두 값을 같게 하면 중간 구간 없이 낮음/높음으로만 나뉩니다. (예: 둘 다 5 → 4명 이하 낮음, 5명 이상 높음)
        </p>
        <button
          type="button"
          onClick={() => void saveConfig()}
          disabled={saving}
          className="mt-4 rounded-lg bg-brand px-4 py-2 text-white font-semibold disabled:opacity-50"
        >
          기준값 저장
        </button>
      </section>

      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">프로모션 금액 매핑 (F-1B)</h2>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1">test_type</th>
              <th className="py-1">환산 금액</th>
            </tr>
          </thead>
          <tbody>
            {pm.map((p, i) => (
              <tr key={p.testType}>
                <td className="py-1">{p.testType}</td>
                <td className="py-1">
                  <input
                    type="number"
                    min={0}
                    value={p.amount}
                    onChange={(e) => {
                      const next = pm.slice();
                      next[i] = { ...p, amount: Number(e.target.value) };
                      setPm(next);
                    }}
                    className="w-full rounded-lg border border-line px-2 py-1"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          onClick={() => void savePromotionMap()}
          disabled={saving}
          className="mt-4 rounded-lg bg-brand px-4 py-2 text-white font-semibold disabled:opacity-50"
        >
          금액 매핑 저장
        </button>
      </section>

      {err ? <div className="rounded-lg border border-danger/30 bg-red-50 px-4 py-3 text-sm text-danger">{err}</div> : null}
      {savedAt ? <div className="text-sm text-muted">저장됨: {savedAt}</div> : null}

      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">변경 이력</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {initial.history.length === 0 ? (
            <li className="text-muted">기록 없음</li>
          ) : (
            initial.history.map((h, i) => (
              <li key={i}>
                {h.changedAt} — low={h.lowThreshold}, high={h.highThreshold}, by {h.changedBy ?? '-'}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
