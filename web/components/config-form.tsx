'use client';

import { useState } from 'react';
import {
  clientFetch,
  type AdminConfig,
  type AdminRecommendationWindow,
  type AdminSchedule,
  type PromotionMap,
} from '../lib/api';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
// 추천 윈도우 select 후보 — 0~12시간(0.5h 단위 미지원: 매치가 정시만 잡히므로).
// DB는 분 단위지만 UI는 시간 단위. 운영자가 더 큰 값을 원하면 API 직접 호출로 1440분(24h)까지 가능.
const WINDOW_HOURS = Array.from({ length: 13 }, (_, h) => h);

export function ConfigForm({
  initial,
  initialPromotionMap,
  initialSchedule,
  initialWindow,
}: {
  initial: AdminConfig;
  initialPromotionMap: PromotionMap;
  initialSchedule: AdminSchedule;
  initialWindow: AdminRecommendationWindow;
}) {
  const [low, setLow] = useState(initial.current.lowThreshold);
  const [high, setHigh] = useState(initial.current.highThreshold);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [startHour, setStartHour] = useState(initialSchedule.current.startHour);
  const [endHour, setEndHour] = useState(initialSchedule.current.endHour);
  const [enabled, setEnabled] = useState(initialSchedule.current.enabled);

  // 추천 윈도우: UI는 시간 단위, DB/API는 분 단위. 60으로 환산해 저장.
  const [windowBeforeHours, setWindowBeforeHours] = useState(
    Math.round(initialWindow.current.beforeMinutes / 60),
  );
  const [windowAfterHours, setWindowAfterHours] = useState(
    Math.round(initialWindow.current.afterMinutes / 60),
  );

  const saveSchedule = async () => {
    setErr(null);
    setSaving(true);
    const r = await clientFetch<AdminSchedule>('/api/admin/schedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startHour, endHour, enabled, changedBy: 'admin-ui' }),
    });
    setSaving(false);
    if (r.ok) setSavedAt(new Date().toISOString());
    else setErr(r.error.message);
  };

  const saveWindow = async () => {
    setErr(null);
    if (windowBeforeHours === 0 && windowAfterHours === 0) {
      setErr('before/after를 둘 다 0으로 두면 추천 윈도우가 비어 어떤 매치도 추천되지 않습니다.');
      return;
    }
    setSaving(true);
    const r = await clientFetch<AdminRecommendationWindow>('/api/admin/recommendation-window', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        beforeMinutes: windowBeforeHours * 60,
        afterMinutes: windowAfterHours * 60,
        changedBy: 'admin-ui',
      }),
    });
    setSaving(false);
    if (r.ok) setSavedAt(new Date().toISOString());
    else setErr(r.error.message);
  };

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

      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">추출 운영 시간대 (F-2)</h2>
        <p className="mt-1 text-sm text-muted">
          대상 추출 배치는 매시 정각에 실행됩니다. 아래 시간대(KST) 안의 정각에만 추출하며, 그 외에는 건너뜁니다.
        </p>
        <label className="mt-4 flex items-center gap-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className="text-sm">자동 추출 사용</span>
        </label>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm text-muted">시작 시각</span>
            <select
              value={startHour}
              onChange={(e) => setStartHour(Number(e.target.value))}
              disabled={!enabled}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2 disabled:opacity-50"
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-muted">종료 시각</span>
            <select
              value={endHour}
              onChange={(e) => setEndHour(Number(e.target.value))}
              disabled={!enabled}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2 disabled:opacity-50"
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-xs text-muted">
          {startHour <= endHour
            ? `매일 ${String(startHour).padStart(2, '0')}:00 ~ ${String(endHour).padStart(2, '0')}:00 정각에 추출합니다.`
            : `매일 ${String(startHour).padStart(2, '0')}:00 ~ 익일 ${String(endHour).padStart(2, '0')}:00 정각에 추출합니다 (자정 넘김).`}
          {' '}추출 대상은 실행 시각 기준 3시간 뒤 매치입니다.
        </p>
        <button
          type="button"
          onClick={() => void saveSchedule()}
          disabled={saving}
          className="mt-4 rounded-lg bg-brand px-4 py-2 text-white font-semibold disabled:opacity-50"
        >
          운영 시간대 저장
        </button>
      </section>

      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">추천 매치 시간 윈도우</h2>
        <p className="mt-1 text-sm text-muted">
          대상 매치 시작 시각 S 기준 <b>[S − 이전 시간, S + 이후 시간]</b> 범위에서 시작하는 매치를 추천 후보로 잡습니다.
          매니저 보유 매치와 2시간 이내로 겹치는 매치는 별도 충돌 필터로 제외됩니다.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm text-muted">이전 (S − N시간)</span>
            <select
              value={windowBeforeHours}
              onChange={(e) => setWindowBeforeHours(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2"
            >
              {WINDOW_HOURS.map((h) => (
                <option key={h} value={h}>{h === 0 ? '0시간 (S부터)' : `${h}시간`}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-muted">이후 (S + N시간)</span>
            <select
              value={windowAfterHours}
              onChange={(e) => setWindowAfterHours(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2"
            >
              {WINDOW_HOURS.map((h) => (
                <option key={h} value={h}>{h === 0 ? '0시간 (S까지)' : `${h}시간`}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-xs text-muted">
          현재 설정: S 기준 {windowBeforeHours}시간 전 ~ {windowAfterHours}시간 후 (총 {windowBeforeHours + windowAfterHours}시간 윈도우).
          {' '}예: S=20:00, before=0, after=4 → 20:00 ~ 24:00 매치가 추천 후보.
        </p>
        <button
          type="button"
          onClick={() => void saveWindow()}
          disabled={saving}
          className="mt-4 rounded-lg bg-brand px-4 py-2 text-white font-semibold disabled:opacity-50"
        >
          추천 윈도우 저장
        </button>
        {initialWindow.history.length > 0 ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-muted">변경 이력</summary>
            <ul className="mt-2 space-y-1 text-sm">
              {initialWindow.history.map((h, i) => (
                <li key={i}>
                  {h.changedAt} — before={Math.round(h.beforeMinutes / 60)}h, after={Math.round(h.afterMinutes / 60)}h, by{' '}
                  {h.changedBy ?? '-'}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
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
