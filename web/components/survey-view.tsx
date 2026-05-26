'use client';

// 어드민 설문 조회 화면.
// - 기간 필터 (기본 최근 30일)
// - 액션 유형별 총건수
// - 액션 유형별 사유 분포 (코드값 → 사람용 라벨로 변환)
// - 개별 응답 목록 (최신순) — 매니저/매치 컨텍스트 + 기타/제안 자유 입력
import { useState } from 'react';
import { clientFetch } from '../lib/api';
import type {
  SurveyActionType,
  SurveyReasonBreakdown,
  SurveyReport,
  SurveyResponseItem,
} from '@shared/api';

function toLocalYmd(d: Date): string {
  return d.toLocaleDateString('sv-SE');
}
function ymdToKstIso(ymd: string, endOfDay = false): string {
  const time = endOfDay ? '23:59:59' : '00:00:00';
  return new Date(`${ymd}T${time}+09:00`).toISOString();
}

// 사유 코드 → 사람용 라벨 매핑. 미지 코드는 코드 그대로 표시.
const REASON_LABELS: Record<SurveyActionType, Record<string, string>> = {
  keep: {
    few_options: '추천된 매치의 선택지가 적어서',
    location_mismatch: '추천된 매치의 장소 조건이 맞지 않아서',
    current_match_likely: '기존에 보유하고 있던 매치가 진행될 수 있을 것 같아서',
    current_match_benefit: '기존 보유하고 있던 매치의 혜택을 받고 싶어서',
    other: '기타',
  },
  select: {
    high_likelihood: '이동 가능한 매치의 진행 가능성이 높아 보여서',
    location_ok: '장소가 비슷하거나 크게 불편하지 않아서',
    same_time: '시간이 동일해서',
    other: '기타',
  },
};

function reasonLabel(actionType: SurveyActionType, code: string): string {
  return REASON_LABELS[actionType][code] ?? code;
}

function ReasonBreakdownTable({
  title,
  rows,
  actionType,
  emptyText,
  barClass,
}: {
  title: string;
  rows: SurveyReasonBreakdown[];
  actionType: SurveyActionType;
  emptyText: string;
  barClass: string;
}) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted">총 {total.toLocaleString()} 응답</span>
      </div>
      {rows.length > 0 ? (
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1">사유</th>
              <th className="py-1 text-right">건수</th>
              <th className="py-1 pl-4">분포</th>
              <th className="py-1 text-right">비중</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = total === 0 ? 0 : (r.count / total) * 100;
              return (
                <tr key={r.reason} className="border-t border-line">
                  <td className="py-2">{reasonLabel(actionType, r.reason)}</td>
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

function ResponseRow({ item }: { item: SurveyResponseItem }) {
  const actionLabel = item.actionType === 'select' ? '이동 요청' : '유지';
  return (
    <tr className="border-t border-line align-top">
      <td className="py-2 pr-3 text-xs tabular-nums text-muted whitespace-nowrap">
        {item.submittedKst}
      </td>
      <td className="py-2 px-2">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
            item.actionType === 'select'
              ? 'bg-brandSoft text-brand'
              : 'bg-amber-50 text-warning'
          }`}
        >
          {actionLabel}
        </span>
      </td>
      <td className="py-2 px-2 text-sm">{item.managerName ?? `(target ${item.targetId})`}</td>
      <td className="py-2 px-2 text-xs text-muted">
        {item.currentStadiumName ?? '-'}
        {item.currentMatchTime ? ` / ${item.currentMatchTime}` : ''}
      </td>
      <td className="py-2 px-2 text-sm">
        <ul className="space-y-0.5">
          {item.reasons.map((r) => (
            <li key={r}>• {reasonLabel(item.actionType, r)}</li>
          ))}
        </ul>
        {item.otherText ? (
          <p className="mt-1 rounded bg-surface px-2 py-1 text-xs text-muted">
            기타: {item.otherText}
          </p>
        ) : null}
      </td>
      <td className="py-2 px-2 text-xs text-muted">
        {item.suggestion ? (
          <p className="whitespace-pre-wrap">{item.suggestion}</p>
        ) : (
          <span className="text-muted/60">-</span>
        )}
      </td>
    </tr>
  );
}

export function SurveyView({ report: initial }: { report: SurveyReport }) {
  const todayYmd = toLocalYmd(new Date());
  const monthAgoYmd = toLocalYmd(new Date(Date.now() - 29 * 86400_000));
  const [from, setFrom] = useState(monthAgoYmd);
  const [to, setTo] = useState(todayYmd);
  const [actionFilter, setActionFilter] = useState<'all' | SurveyActionType>('all');
  const [report, setReport] = useState<SurveyReport>(initial);
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
    const r = await clientFetch<SurveyReport>(`/api/admin/surveys?${params.toString()}`);
    setLoading(false);
    if (r.ok) setReport(r.data);
    else setErr(r.error.message);
  };

  const setQuickRange = (days: number) => {
    setTo(todayYmd);
    setFrom(toLocalYmd(new Date(Date.now() - (days - 1) * 86400_000)));
  };

  const visibleItems = report.items.filter(
    (i) => actionFilter === 'all' || i.actionType === actionFilter,
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">기간 필터</h2>
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
        <h2 className="text-lg font-semibold">설문 응답 총괄</h2>
        <p className="mt-1 text-xs text-muted">
          기간: {report.range.from} ~ {report.range.to}
        </p>
        <dl className="mt-3 flex gap-8 text-sm">
          <div>
            <dt className="text-muted">전체 응답</dt>
            <dd className="text-2xl font-bold tabular-nums">{report.totals.all}</dd>
          </div>
          <div>
            <dt className="text-muted">이동 요청</dt>
            <dd className="text-2xl font-bold tabular-nums text-brand">{report.totals.select}</dd>
          </div>
          <div>
            <dt className="text-muted">유지</dt>
            <dd className="text-2xl font-bold tabular-nums text-warning">{report.totals.keep}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">사유 분포</h2>
        <p className="mt-1 text-xs text-muted">복수 선택 가능하므로 응답 수와 사유 합계는 다를 수 있습니다.</p>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <ReasonBreakdownTable
            title="이동 요청 — 이동하신 이유"
            rows={report.reasons.select}
            actionType="select"
            emptyText="해당 기간 이동 요청 측 응답이 없습니다."
            barClass="bg-brand"
          />
          <ReasonBreakdownTable
            title="유지 — 이동하지 않으신 이유"
            rows={report.reasons.keep}
            actionType="keep"
            emptyText="해당 기간 유지 측 응답이 없습니다."
            barClass="bg-warning"
          />
        </div>
      </section>

      <section className="rounded-xl border border-line bg-white p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">개별 응답 ({visibleItems.length})</h2>
          <div className="flex gap-1 text-xs">
            {(['all', 'select', 'keep'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setActionFilter(f)}
                className={`rounded-full border px-3 py-1 ${
                  actionFilter === f
                    ? 'border-brand bg-brandSoft text-brand'
                    : 'border-line bg-white text-muted hover:border-brand/50'
                }`}
              >
                {f === 'all' ? '전체' : f === 'select' ? '이동 요청' : '유지'}
              </button>
            ))}
          </div>
        </div>
        {visibleItems.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3">제출 시각</th>
                  <th className="py-2 px-2">액션</th>
                  <th className="py-2 px-2">매니저</th>
                  <th className="py-2 px-2">현재 매치</th>
                  <th className="py-2 px-2">사유</th>
                  <th className="py-2 px-2">기타 제안</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => (
                  <ResponseRow key={item.id} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">조건에 맞는 응답이 없습니다.</p>
        )}
      </section>
    </div>
  );
}
