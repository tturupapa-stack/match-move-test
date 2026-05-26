'use client';

import { Fragment, useState } from 'react';
import { clientFetch } from '../lib/api';
import { formatStadium } from '../lib/format';
import type { EventType, ExportHistoryItem, ExportHistoryReport } from '@shared/api';
import { GradeBadge, formatGrade } from './grade-badge';

const EVENT_LABELS: Record<EventType, string> = {
  extracted: '추출됨',
  bizm_exported: '발송 완료',
  bizm_excluded: '대상 제외',
  page_entered: '페이지 진입',
  change_requested: '변경 요청',
  kept_existing: '현재 매치 유지',
  no_response: '무응답(유지)',
  entered_after_deadline: '마감 후 진입',
  change_completed: '변경 완료',
  match_result: '매치 결과',
};

function StatusBadge({ status }: { status: ExportHistoryItem['status'] }) {
  return status === 'exported' ? (
    <span className="rounded bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">발송 완료</span>
  ) : (
    <span className="rounded bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">대상 제외</span>
  );
}

function DetailRow({ item }: { item: ExportHistoryItem }) {
  return (
    <td colSpan={6} className="bg-surface px-4 py-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold text-muted">현재 매치</h4>
          <ul className="mt-1 space-y-0.5 text-sm">
            <li>
              시각 · 경기장: {item.matchTime ?? '—'}
              {item.stadiumName ? ` · ${formatStadium(item.stadiumName, item.fieldName)}` : ''}
            </li>
            <li>등급: {formatGrade(item.currentGrade)}</li>
            <li>참가자 수: {item.participantCount ?? '—'}</li>
            <li>대상 #: {item.targetId ?? '—'}</li>
            <li>
              현재 상태: {item.notificationStatus ?? '—'}
              {item.exportCount != null && item.exportCount > 1 ? ` (재발송 ${item.exportCount}회)` : ''}
            </li>
          </ul>

          <h4 className="mt-4 text-xs font-semibold text-muted">진행 타임라인</h4>
          {item.timeline.length > 0 ? (
            <ol className="mt-1 space-y-1 text-sm">
              {item.timeline.map((s, i) => (
                <li key={`${s.eventType}-${i}`} className="flex gap-2">
                  <span className="tabular-nums text-muted">{s.occurredKst}</span>
                  <span>{EVENT_LABELS[s.eventType] ?? s.eventType}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-1 text-sm text-muted">기록된 이벤트가 없습니다.</p>
          )}
        </div>

        <div>
          <h4 className="text-xs font-semibold text-muted">
            발송 당시 추천 매치 {item.recommended.length}개 (관리자 전용)
          </h4>
          {item.recommended.length > 0 ? (
            <ul className="mt-1 space-y-1 text-sm">
              {item.recommended.map((r) => (
                <li key={r.matchId} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span>
                      {r.scheduleKst} · {formatStadium(r.stadiumName, r.fieldName)} (참가자 {r.participantCount})
                    </span>
                    <GradeBadge grade={r.grade} size="xs" />
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {r.isTransferOrigin && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs">양도</span>
                    )}
                    {r.isPromotion && (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs">프로모션</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted">추천 매치 정보가 없습니다.</p>
          )}
        </div>
      </div>
    </td>
  );
}

// occurredKst('YYYY-MM-DD HH:mm')에서 날짜 부분만.
function dayKey(occurredKst: string): string {
  return occurredKst.slice(0, 10);
}

// 로컬(브라우저) 기준 'YYYY-MM-DD' — date input value 형식.
function toLocalYmd(d: Date): string {
  return d.toLocaleDateString('sv-SE'); // 'YYYY-MM-DD' (sv-SE 로케일 보장)
}

// 'YYYY-MM-DD' → KST 00:00 또는 23:59:59의 ISO UTC.
function ymdToKstIso(ymd: string, endOfDay = false): string {
  const time = endOfDay ? '23:59:59' : '00:00:00';
  return new Date(`${ymd}T${time}+09:00`).toISOString();
}

export function ExportHistoryView({ report: initial }: { report: ExportHistoryReport }) {
  const todayYmd = toLocalYmd(new Date());
  const weekAgoYmd = toLocalYmd(new Date(Date.now() - 6 * 86400_000));
  const [from, setFrom] = useState(weekAgoYmd);
  const [to, setTo] = useState(todayYmd);
  const [statusFilter, setStatusFilter] = useState<'all' | 'exported' | 'excluded'>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc'); // 처리 시각 정렬
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);

  const apply = async () => {
    if (from > to) {
      setErr('시작일이 종료일보다 클 수 없습니다.');
      return;
    }
    setLoading(true);
    setErr(null);
    const fromIso = ymdToKstIso(from, false);
    const toIso = ymdToKstIso(to, true);
    const q = `?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
    const r = await clientFetch<ExportHistoryReport>(`/api/admin/export/history${q}`);
    setLoading(false);
    if (r.ok) setData(r.data);
    else setErr(r.error.message);
  };

  const setQuickRange = (days: number) => {
    setTo(todayYmd);
    setFrom(toLocalYmd(new Date(Date.now() - (days - 1) * 86400_000)));
  };

  // 구버전 추출분 fieldName 보강 — 이번 기능 이전 대상은 jsonb에 면 번호가 비어 있어 표시되지 않음.
  // 클릭 시 PLAB에서 일괄 조회해 targets 테이블을 한 번에 업데이트.
  const backfillFieldName = async () => {
    setBackfillBusy(true);
    setBackfillMsg(null);
    const r = await clientFetch<{
      examined: number;
      updated: number;
      plabQueried: number;
      plabMissing: number;
    }>('/api/admin/targets/backfill-field-name', { method: 'POST' });
    setBackfillBusy(false);
    if (r.ok) {
      const { examined, updated, plabMissing } = r.data;
      if (examined === 0) {
        setBackfillMsg('보강할 대상이 없습니다 (이미 모두 구장면 번호 포함).');
      } else {
        setBackfillMsg(
          `검토 ${examined}건 · 업데이트 ${updated}건` +
            (plabMissing > 0 ? ` · PLAB에서 응답 없는 매치 ${plabMissing}건` : ''),
        );
        await apply(); // 결과 반영
      }
    } else {
      setBackfillMsg(`실패: ${r.error.message}`);
    }
  };

  const { items, exportedCount, excludedCount } = data;

  // 상태 필터 + 정렬을 클라이언트에서 적용 (server는 from/to만 필터).
  const filtered = items
    .filter((it) => (statusFilter === 'all' ? true : it.status === statusFilter))
    .sort((a, b) =>
      sortOrder === 'desc' ? b.occurredKst.localeCompare(a.occurredKst) : a.occurredKst.localeCompare(b.occurredKst),
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
          <label className="block">
            <span className="block text-xs text-muted">상태</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'exported' | 'excluded')}
              className="mt-1 rounded-lg border border-line px-3 py-1.5"
            >
              <option value="all">전체</option>
              <option value="exported">발송 완료</option>
              <option value="excluded">대상 제외</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-muted">정렬</span>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
              className="mt-1 rounded-lg border border-line px-3 py-1.5"
            >
              <option value="desc">최신순</option>
              <option value="asc">오래된순</option>
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

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <button
            type="button"
            onClick={backfillFieldName}
            disabled={backfillBusy}
            className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface disabled:opacity-40"
            title="이 기능 배포 이전에 추출된 대상의 구장면 번호(plab.stadium.name)를 PLAB에서 일괄 조회해 보강합니다. idempotent."
          >
            {backfillBusy ? '보강 중…' : '구버전 대상 구장면 번호 보강'}
          </button>
          {backfillMsg && <span className="text-xs text-muted">{backfillMsg}</span>}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">발송/제외 집계</h2>
        <dl className="mt-3 flex gap-8 text-sm">
          <div>
            <dt className="text-muted">발송 완료</dt>
            <dd className="text-2xl font-bold tabular-nums text-accent">{exportedCount}</dd>
          </div>
          <div>
            <dt className="text-muted">대상 제외</dt>
            <dd className="text-2xl font-bold tabular-nums text-danger">{excludedCount}</dd>
          </div>
          <div>
            <dt className="text-muted">표시 중</dt>
            <dd className="text-2xl font-bold tabular-nums">{filtered.length}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">처리 이력</h2>
        <p className="mt-1 text-xs text-muted">행을 클릭하면 추천 매치·진행 타임라인 등 상세를 볼 수 있습니다.</p>
        {filtered.length > 0 ? (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-line">
                <th className="w-6 py-2" />
                <th className="py-2">처리 시각</th>
                <th className="py-2">상태</th>
                <th className="py-2">매니저</th>
                <th className="py-2">현재 매치</th>
                <th className="py-2">처리자</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it, idx) => {
                const open = openId === it.id;
                const prev = filtered[idx - 1];
                const showDayHeader = !prev || dayKey(prev.occurredKst) !== dayKey(it.occurredKst);
                return (
                  <Fragment key={it.id}>
                    {showDayHeader && (
                      <tr className="bg-surface">
                        <td colSpan={6} className="py-1.5 px-2 text-xs font-semibold tabular-nums text-muted">
                          {dayKey(it.occurredKst)}
                        </td>
                      </tr>
                    )}
                    <tr
                      onClick={() => setOpenId(open ? null : it.id)}
                      className="cursor-pointer border-b border-line hover:bg-surface"
                    >
                      <td className="py-2 text-muted">{open ? '▾' : '▸'}</td>
                      <td className="py-2 tabular-nums text-muted">{it.occurredKst}</td>
                      <td className="py-2">
                        <StatusBadge status={it.status} />
                      </td>
                      <td className="py-2">{it.managerName ?? `대상 #${it.targetId ?? '?'}`}</td>
                      <td className="py-2 text-muted">
                        <span className="inline-flex items-center gap-2">
                          {it.matchTime
                            ? `${it.matchTime}${
                                it.stadiumName ? ` · ${formatStadium(it.stadiumName, it.fieldName)}` : ''
                              }`
                            : '—'}
                          <GradeBadge grade={it.currentGrade} size="xs" />
                        </span>
                      </td>
                      <td className="py-2 text-muted">{it.operator ?? '—'}</td>
                    </tr>
                    {open && (
                      <tr className="border-b border-line">
                        <DetailRow item={it} />
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="mt-4 text-sm text-muted">기간/조건에 맞는 이력이 없습니다.</p>
        )}
      </section>
    </div>
  );
}
