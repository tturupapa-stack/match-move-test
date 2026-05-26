'use client';

import { useState } from 'react';
import { clientFetch } from '../lib/api';
import type { FunnelBucketRow, FunnelReport, FunnelSteps, ReportBucket } from '@shared/api';

type BucketChoice = 'none' | ReportBucket;

// 로컬(브라우저) 기준 'YYYY-MM-DD' — date input value 형식.
function toLocalYmd(d: Date): string {
  return d.toLocaleDateString('sv-SE');
}
function ymdToKstIso(ymd: string, endOfDay = false): string {
  const time = endOfDay ? '23:59:59' : '00:00:00';
  return new Date(`${ymd}T${time}+09:00`).toISOString();
}
function fmtPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

const STEP_COLS: Array<{ key: keyof FunnelSteps; label: string }> = [
  { key: 'extracted', label: '추출' },
  { key: 'exported', label: '발송' },
  { key: 'pageEntered', label: '진입' },
  { key: 'changeRequested', label: '변경요청' },
  { key: 'keptExisting', label: '유지' },
  { key: 'noResponse', label: '무응답' },
  { key: 'changeCompleted', label: '완료' },
];

function TotalsTable({ report }: { report: FunnelReport }) {
  const rows: Array<{ label: string; value: number; rate?: number }> = [
    { label: '추출됨', value: report.steps.extracted },
    { label: '발송 완료', value: report.steps.exported },
    { label: '페이지 진입', value: report.steps.pageEntered },
    { label: '변경 요청', value: report.steps.changeRequested, rate: report.derived.changeRequestRate },
    { label: '유지 선택', value: report.steps.keptExisting },
    { label: '무응답 (유지 간주)', value: report.steps.noResponse },
    { label: '운영자 처리 완료', value: report.steps.changeCompleted, rate: report.derived.completionRate },
  ];
  return (
    <table className="mt-4 w-full text-sm">
      <thead className="text-left text-muted">
        <tr>
          <th className="py-1">단계</th>
          <th className="py-1 text-right">건수</th>
          <th className="py-1 text-right">전환율</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-line">
            <td className="py-2">{r.label}</td>
            <td className="py-2 text-right tabular-nums">{r.value}</td>
            <td className="py-2 text-right tabular-nums">
              {r.rate !== undefined ? fmtPct(r.rate) : '-'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SeriesTable({ series, bucket }: { series: FunnelBucketRow[]; bucket: ReportBucket }) {
  if (series.length === 0) {
    return <p className="mt-4 text-sm text-muted">해당 기간의 이벤트가 없습니다.</p>;
  }
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted">
          <tr className="border-b border-line">
            <th className="py-2 pr-3">{bucket === 'week' ? '주 시작(월)' : '일자'}</th>
            {STEP_COLS.map((c) => (
              <th key={c.key} className="py-2 px-2 text-right">
                {c.label}
              </th>
            ))}
            <th className="py-2 px-2 text-right">요청률</th>
            <th className="py-2 pl-2 text-right">완료율</th>
          </tr>
        </thead>
        <tbody>
          {series.map((row) => (
            <tr key={row.bucketStart} className="border-b border-line">
              <td className="py-1.5 pr-3 tabular-nums text-muted">{row.bucketStart}</td>
              {STEP_COLS.map((c) => (
                <td key={c.key} className="py-1.5 px-2 text-right tabular-nums">
                  {row.steps[c.key]}
                </td>
              ))}
              <td className="py-1.5 px-2 text-right tabular-nums">{fmtPct(row.derived.changeRequestRate)}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums">{fmtPct(row.derived.completionRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FunnelView({ report: initial }: { report: FunnelReport }) {
  const todayYmd = toLocalYmd(new Date());
  const weekAgoYmd = toLocalYmd(new Date(Date.now() - 6 * 86400_000));
  const [from, setFrom] = useState(weekAgoYmd);
  const [to, setTo] = useState(todayYmd);
  const [bucket, setBucket] = useState<BucketChoice>('none');
  const [report, setReport] = useState<FunnelReport>(initial);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recomputeBusy, setRecomputeBusy] = useState(false);
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null);

  // 현재 from/to 입력값 → API 쿼리스트링 (from/to/bucket).
  const buildParams = () => {
    const params = new URLSearchParams({
      from: ymdToKstIso(from, false),
      to: ymdToKstIso(to, true),
    });
    if (bucket !== 'none') params.set('bucket', bucket);
    return params;
  };

  const apply = async () => {
    if (from > to) {
      setErr('시작일이 종료일보다 클 수 없습니다.');
      return;
    }
    setLoading(true);
    setErr(null);
    const r = await clientFetch<FunnelReport>(`/api/admin/funnel?${buildParams().toString()}`);
    setLoading(false);
    if (r.ok) setReport(r.data);
    else setErr(r.error.message);
  };

  const recomputePromotion = async () => {
    setRecomputeBusy(true);
    setRecomputeMsg(null);
    const params = new URLSearchParams({
      from: ymdToKstIso(from, false),
      to: ymdToKstIso(to, true),
    });
    const r = await clientFetch<{ examined: number; updated: number; stillMissingAmount: number }>(
      `/api/admin/funnel/recompute-promotion?${params.toString()}`,
      { method: 'POST' },
    );
    setRecomputeBusy(false);
    if (r.ok) {
      setRecomputeMsg(
        `재계산 완료 — 검토 ${r.data.examined}건, 업데이트 ${r.data.updated}건` +
          (r.data.stillMissingAmount > 0
            ? `, 매핑/test_type 미확보 ${r.data.stillMissingAmount}건`
            : ''),
      );
      // 결과 반영을 위해 재조회
      await apply();
    } else {
      setRecomputeMsg(`실패: ${r.error.message}`);
    }
  };

  const setQuickRange = (days: number) => {
    setTo(todayYmd);
    setFrom(toLocalYmd(new Date(Date.now() - (days - 1) * 86400_000)));
  };

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
        <h2 className="text-lg font-semibold">Funnel (기간 합계)</h2>
        <p className="mt-1 text-xs text-muted">
          기간: {report.range.from} ~ {report.range.to}
        </p>
        <TotalsTable report={report} />
      </section>

      {report.bucket && report.series && (
        <section className="rounded-xl border border-line bg-white p-6">
          <h2 className="text-lg font-semibold">
            {report.bucket === 'week' ? '주별' : '일별'} 시계열
          </h2>
          <p className="mt-1 text-xs text-muted">
            기간 내 이벤트가 발생한 {report.bucket === 'week' ? '주' : '일'}만 표시됩니다.
          </p>
          <SeriesTable series={report.series} bucket={report.bucket} />
        </section>
      )}

      <section className="rounded-xl border border-line bg-white p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">비용 절감 (부차 지표)</h2>
          <span className="text-xs text-muted">스냅샷 — 새 이동이 반영 안 되면 ‘적용’으로 재조회</span>
        </div>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">양도+프로모션 이동 완료</dt>
            <dd className="tabular-nums">{report.costSavings.completedTransferPromotion} 건</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">추정 잠재 절감 총액</dt>
            <dd className="tabular-nums">{report.costSavings.totalEstimatedAmount.toLocaleString()} 원</dd>
          </div>
        </dl>

        <CostBreakdownBox breakdown={report.costSavings.breakdown} />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={recomputePromotion}
            disabled={recomputeBusy}
            className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface disabled:opacity-40"
            title="누락된 promotion_released_amount / is_transferred_origin을 change_requested + promotion_amount_map으로 재계산"
          >
            {recomputeBusy ? '재계산 중…' : '누락 메타 재계산'}
          </button>
          {recomputeMsg && <span className="text-sm text-muted">{recomputeMsg}</span>}
        </div>
      </section>
    </div>
  );
}

// 비용 절감 누락 진단 박스 — 어느 단계에서 카운트가 빠지는지 운영자가 즉시 식별.
function CostBreakdownBox({
  breakdown,
}: {
  breakdown: FunnelReport['costSavings']['breakdown'];
}) {
  const { completedTotal, completedWithTransfer, completedWithAmount, missingAmount } = breakdown;
  const transferGap = completedTotal - completedWithTransfer;
  const amountGap = completedWithTransfer - completedWithAmount;
  const allHealthy = completedTotal > 0 && amountGap === 0 && transferGap === 0;
  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        집계 진단 (왜 위 숫자가 이렇게 나왔는지)
      </div>
      <ol className="space-y-1.5">
        <li className="flex justify-between gap-3">
          <span>① 이동 완료 이벤트 (Slack ✅ 처리)</span>
          <span className="tabular-nums">{completedTotal} 건</span>
        </li>
        <li className="flex justify-between gap-3">
          <span className="pl-4">└ 양도 매물이었던 건 (is_transferred_origin=true)</span>
          <span className="tabular-nums">
            {completedWithTransfer}
            {transferGap > 0 && <span className="ml-1 text-muted">(−{transferGap})</span>}
          </span>
        </li>
        <li className="flex justify-between gap-3">
          <span className="pl-8">└ 프로모션 금액 매핑됨 (최종 카운트)</span>
          <span className="tabular-nums font-semibold">
            {completedWithAmount}
            {amountGap > 0 && <span className="ml-1 text-danger">(−{amountGap})</span>}
          </span>
        </li>
      </ol>
      {amountGap > 0 && (
        <div className="mt-2 rounded bg-white p-2 text-xs">
          <div className="font-medium text-danger">금액 미매핑 {amountGap}건 사유</div>
          <ul className="mt-1 ml-4 list-disc text-muted">
            {missingAmount.noTestType > 0 && (
              <li>
                요청 시점 <code>test_type</code>이 NULL — PLAB q5 일시 장애 가능성 ({missingAmount.noTestType}건)
              </li>
            )}
            {missingAmount.noMapping > 0 && (
              <li>
                <code>promotion_amount_map</code>에 해당 test_type 행 없음 — /admin/config에서 매핑 입력 필요 (
                {missingAmount.noMapping}건)
              </li>
            )}
            {missingAmount.noTestType + missingAmount.noMapping < amountGap && (
              <li>
                기타 (구버전 metadata 등) {amountGap - missingAmount.noTestType - missingAmount.noMapping}건
              </li>
            )}
          </ul>
          <p className="mt-1.5 text-muted">
            아래 <b>누락 메타 재계산</b> 버튼을 누르면 가능한 건은 자동 보정됩니다.
          </p>
        </div>
      )}
      {allHealthy && (
        <p className="mt-1 text-xs text-brand">모든 이동 완료 건이 비용 절감 카운트에 포함되어 있습니다.</p>
      )}
      {completedTotal === 0 && (
        <p className="mt-1 text-xs text-muted">
          기간 내 <code>change_completed</code> 이벤트가 없습니다. Slack ✅ 반응이 webhook으로 들어왔는지 확인하세요.
        </p>
      )}
    </div>
  );
}

