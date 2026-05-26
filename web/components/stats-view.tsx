'use client';

import { useState } from 'react';
import { clientFetch } from '../lib/api';
import type { ReportBucket, StatsBucketRow, StatsGradeRow, StatsReport } from '@shared/api';
import { formatGrade } from './grade-badge';

type BucketChoice = 'none' | ReportBucket;

function toLocalYmd(d: Date): string {
  return d.toLocaleDateString('sv-SE');
}
function ymdToKstIso(ymd: string, endOfDay = false): string {
  const time = endOfDay ? '23:59:59' : '00:00:00';
  return new Date(`${ymd}T${time}+09:00`).toISOString();
}

function GradeDistribution({
  title,
  rows,
  unitLabel,
  barClass,
  emptyText,
}: {
  title: string;
  rows: StatsGradeRow[];
  unitLabel: string; // '대상' | '추천'
  barClass: string;
  emptyText: string;
}) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted">
          총 {total.toLocaleString()} {unitLabel}
        </span>
      </div>
      {rows.length > 0 ? (
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1">등급</th>
              <th className="py-1 text-right">건수</th>
              <th className="py-1 pl-4">분포</th>
              <th className="py-1 text-right">비중</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = total === 0 ? 0 : (r.count / total) * 100;
              return (
                <tr key={`${r.grade ?? 'null'}`} className="border-t border-line">
                  <td className="py-2">{formatGrade(r.grade)}</td>
                  <td className="py-2 text-right tabular-nums">{r.count.toLocaleString()}</td>
                  <td className="py-2 pl-4">
                    <div
                      className={`h-2.5 rounded ${barClass}`}
                      style={{ width: `${(r.count / max) * 100}%` }}
                    />
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted">{pct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="mt-2 text-sm text-muted">{emptyText}</p>
      )}
    </div>
  );
}

function SeriesTable({ series, bucket }: { series: StatsBucketRow[]; bucket: ReportBucket }) {
  if (series.length === 0) {
    return <p className="mt-4 text-sm text-muted">해당 기간의 추출 이벤트가 없습니다.</p>;
  }
  const maxTargets = Math.max(1, ...series.map((s) => s.targets));
  return (
    <table className="mt-4 w-full text-sm">
      <thead className="text-left text-muted">
        <tr className="border-b border-line">
          <th className="py-2 pr-3">{bucket === 'week' ? '주 시작(월)' : '일자'}</th>
          <th className="py-2 px-2 text-right">대상 수</th>
          <th className="py-2 px-2 text-right">평균 추천 매치 수</th>
          <th className="py-2 pl-2">분포</th>
        </tr>
      </thead>
      <tbody>
        {series.map((row) => (
          <tr key={row.bucketStart} className="border-b border-line">
            <td className="py-1.5 pr-3 tabular-nums text-muted">{row.bucketStart}</td>
            <td className="py-1.5 px-2 text-right tabular-nums">{row.targets}</td>
            <td className="py-1.5 px-2 text-right tabular-nums">{row.avgRecommended.toFixed(1)}</td>
            <td className="py-1.5 pl-2">
              <div
                className="h-2.5 rounded bg-brand"
                style={{ width: `${(row.targets / maxTargets) * 100}%` }}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StatsView({ report: initial }: { report: StatsReport }) {
  const todayYmd = toLocalYmd(new Date());
  const weekAgoYmd = toLocalYmd(new Date(Date.now() - 6 * 86400_000));
  const [from, setFrom] = useState(weekAgoYmd);
  const [to, setTo] = useState(todayYmd);
  const [bucket, setBucket] = useState<BucketChoice>('none');
  const [report, setReport] = useState<StatsReport>(initial);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const apply = async () => {
    if (from > to) {
      setErr('시작일이 종료일보다 클 수 없습니다.');
      return;
    }
    setLoading(true);
    setErr(null);
    const params = new URLSearchParams({
      from: ymdToKstIso(from, false),
      to: ymdToKstIso(to, true),
    });
    if (bucket !== 'none') params.set('bucket', bucket);
    const r = await clientFetch<StatsReport>(`/api/admin/stats?${params.toString()}`);
    setLoading(false);
    if (r.ok) setReport(r.data);
    else setErr(r.error.message);
  };

  const setQuickRange = (days: number) => {
    setTo(todayYmd);
    setFrom(toLocalYmd(new Date(Date.now() - (days - 1) * 86400_000)));
  };

  const { recommended, areas, grades } = report;
  const maxDist = Math.max(1, ...recommended.distribution.map((d) => d.targets));
  const maxArea = Math.max(1, ...areas.map((a) => a.targets));

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">기간·집계 단위</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-xs text-muted">시작일</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 rounded-lg border border-line px-3 py-1.5"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-muted">종료일</span>
            <input
              type="date"
              value={to}
              min={from}
              max={todayYmd}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 rounded-lg border border-line px-3 py-1.5"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-muted">집계 단위</span>
            <select
              value={bucket}
              onChange={(e) => setBucket(e.target.value as BucketChoice)}
              className="mt-1 rounded-lg border border-line px-3 py-1.5"
            >
              <option value="none">전체 합계</option>
              <option value="day">일별</option>
              <option value="week">주별 (월요일 시작)</option>
            </select>
          </label>
          <button
            type="button"
            onClick={apply}
            disabled={loading}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {loading ? '조회 중…' : '적용'}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="text-muted">빠른 선택:</span>
          {[
            { label: '오늘', d: 1 },
            { label: '7일', d: 7 },
            { label: '30일', d: 30 },
            { label: '90일', d: 90 },
          ].map((q) => (
            <button
              key={q.d}
              type="button"
              onClick={() => setQuickRange(q.d)}
              className="rounded border border-line px-2 py-0.5 hover:bg-surface"
            >
              {q.label}
            </button>
          ))}
        </div>
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
      </section>

      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">대상당 제안된 추천 매치 수 (기간 합계)</h2>
        <p className="mt-1 text-xs text-muted">
          기간: {report.range.from} ~ {report.range.to}
        </p>
        <dl className="mt-3 flex gap-8 text-sm">
          <div>
            <dt className="text-muted">추출 대상</dt>
            <dd className="text-2xl font-bold tabular-nums">{recommended.targets}</dd>
          </div>
          <div>
            <dt className="text-muted">평균 추천 수</dt>
            <dd className="text-2xl font-bold tabular-nums">{recommended.avg.toFixed(1)}</dd>
          </div>
        </dl>
        {recommended.distribution.length > 0 ? (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1">추천 매치 수</th>
                <th className="py-1 text-right">대상 건수</th>
                <th className="py-1 pl-4">분포</th>
              </tr>
            </thead>
            <tbody>
              {recommended.distribution.map((d) => (
                <tr key={d.count} className="border-t border-line">
                  <td className="py-2 tabular-nums">{d.count}개</td>
                  <td className="py-2 text-right tabular-nums">{d.targets}</td>
                  <td className="py-2 pl-4">
                    <div
                      className="h-3 rounded bg-brand"
                      style={{ width: `${(d.targets / maxDist) * 100}%` }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-4 text-sm text-muted">집계할 데이터가 없습니다.</p>
        )}
      </section>

      {report.bucket && report.series && (
        <section className="rounded-xl border border-line bg-white p-6">
          <h2 className="text-lg font-semibold">
            {report.bucket === 'week' ? '주별' : '일별'} 추출 추이
          </h2>
          <p className="mt-1 text-xs text-muted">
            추출 이벤트가 발생한 {report.bucket === 'week' ? '주' : '일'}만 표시됩니다.
          </p>
          <SeriesTable series={report.series} bucket={report.bucket} />
        </section>
      )}

      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">매치 등급 분포</h2>
        <p className="mt-1 text-xs text-muted">
          현재 매치(추출된 대상자) · 추천 매치 각각의 등급별 비중. 구버전 추출 데이터엔 등급 정보가 없어
          최근 추출분만 집계됩니다.
        </p>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <GradeDistribution
            title="현재 매치 등급 (추출된 대상)"
            rows={grades.current}
            unitLabel="대상"
            barClass="bg-brand"
            emptyText="기간 내 등급 정보가 누적된 추출 이벤트가 없습니다."
          />
          <GradeDistribution
            title="추천 매치 등급"
            rows={grades.recommended}
            unitLabel="추천"
            barClass="bg-accent"
            emptyText="기간 내 등급 정보가 누적된 추천 매치가 없습니다."
          />
        </div>
      </section>

      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">현재 매치 지역구 분포</h2>
        {areas.length > 0 ? (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1">지역구</th>
                <th className="py-1 text-right">대상 건수</th>
                <th className="py-1 pl-4">분포</th>
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => (
                <tr key={`${a.areaId ?? 'na'}-${a.areaName}`} className="border-t border-line">
                  <td className="py-2">{a.areaName}</td>
                  <td className="py-2 text-right tabular-nums">{a.targets}</td>
                  <td className="py-2 pl-4">
                    <div
                      className="h-3 rounded bg-accent"
                      style={{ width: `${(a.targets / maxArea) * 100}%` }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-4 text-sm text-muted">집계할 데이터가 없습니다.</p>
        )}
      </section>
    </div>
  );
}
