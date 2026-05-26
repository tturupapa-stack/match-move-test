'use client';

import { useState } from 'react';
import { clientFetch, type ManualExtractResult } from '../lib/api';
import { GradeBadge } from './grade-badge';

export function RunPanel() {
  const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (로컬)
  const [date, setDate] = useState(today);
  const [hour, setHour] = useState(19);
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ManualExtractResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    setResult(null);
    const body: Record<string, unknown> = {
      targetSchedule: `${date} ${String(hour).padStart(2, '0')}:00:00`,
      dryRun,
    };
    if (low) body.lowThreshold = Number(low);
    if (high) body.highThreshold = Number(high);
    const r = await clientFetch<ManualExtractResult>('/api/admin/run-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (r.ok) setResult(r.data);
    else setErr(r.error.message);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">추출 조건</h2>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm text-muted">매치 날짜</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm text-muted">매치 시각 (정시)</span>
            <select
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2"
            >
              {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-muted">낮음 기준 (빈칸=저장값)</span>
            <input
              type="number"
              min={1}
              max={50}
              value={low}
              placeholder="예: 8"
              onChange={(e) => setLow(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm text-muted">높음 기준 (빈칸=저장값)</span>
            <input
              type="number"
              min={1}
              max={50}
              value={high}
              placeholder="예: 10"
              onChange={(e) => setHigh(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2"
            />
          </label>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          <span>
            <b>미리보기(dry-run)</b> — 체크 시 DB 저장·슬랙 발송 없이 결과만 확인. 해제하면 실제 저장 +
            슬랙 알림.
          </span>
        </label>

        <div className="mt-5">
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {busy ? '실행 중…' : dryRun ? '미리보기 실행' : '실제 추출 실행'}
          </button>
          {!dryRun && (
            <span className="ml-3 text-sm text-danger">
              ⚠️ 실제 저장 + 슬랙 발송됩니다 (운영 데이터에 반영)
            </span>
          )}
        </div>
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
      </section>

      {result && (
        <section className="rounded-xl border border-line bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">결과</h2>
            <span className="rounded-full bg-brandSoft px-3 py-1 text-xs font-medium">
              {result.dryRun ? '미리보기' : '실제 저장됨'}
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">매치 시각</dt>
              <dd className="tabular-nums">{result.targetSchedule}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">기준값 (낮음/높음)</dt>
              <dd className="tabular-nums">
                {result.lowThreshold} / {result.highThreshold}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Q1 후보</dt>
              <dd className="tabular-nums">{result.rawCandidates}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">중복 제외 후</dt>
              <dd className="tabular-nums">{result.afterDedup}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">추천 매치 있는 대상</dt>
              <dd className="tabular-nums">{result.afterRecommendationFilter}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">{result.dryRun ? '저장 예정' : '신규 저장'}</dt>
              <dd className="tabular-nums font-semibold">
                {result.dryRun ? result.preview.length : result.inserted}
              </dd>
            </div>
          </dl>

          {result.dryRun && result.preview.length > 0 && (
            <table className="mt-5 w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-1">매니저</th>
                  <th className="py-1">현재 매치</th>
                  <th className="py-1 text-right">참가자</th>
                  <th className="py-1 text-right">추천 수</th>
                </tr>
              </thead>
              <tbody>
                {result.preview.map((p, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-2">{p.managerName ?? '-'}</td>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-2">
                        {p.current.scheduleKst} · {p.current.stadiumName}
                        <GradeBadge grade={p.current.grade} size="xs" />
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{p.current.participantCount}</td>
                    <td className="py-2 text-right tabular-nums">{p.recommendedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!result.dryRun && result.inserted > 0 && (
            <p className="mt-4 text-sm text-brand">
              {result.inserted}건이 발송 대기로 저장되었습니다 → 발송 관리 화면에서 확인하세요.
            </p>
          )}
          {result.afterRecommendationFilter === 0 && (
            <p className="mt-4 text-sm text-muted">
              조건을 만족하는 대상이 없습니다. 기준값(낮음)을 올리거나 다른 매치 시각을 시도해보세요.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
