'use client';

import { Fragment, useState } from 'react';
import type { EventType, ExportHistoryItem, ExportHistoryReport } from '@shared/api';

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
            <li>시각 · 경기장: {item.matchTime ?? '—'}{item.stadiumName ? ` · ${item.stadiumName}` : ''}</li>
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
                  <span>
                    {r.scheduleKst} · {r.stadiumName} (참가자 {r.participantCount})
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

export function ExportHistoryView({ report }: { report: ExportHistoryReport }) {
  const { items, exportedCount, excludedCount } = report;
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <div className="space-y-6">
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
        </dl>
      </section>

      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">처리 이력</h2>
        <p className="mt-1 text-xs text-muted">행을 클릭하면 추천 매치·진행 타임라인 등 상세를 볼 수 있습니다.</p>
        {items.length > 0 ? (
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
              {items.map((it) => {
                const open = openId === it.id;
                return (
                  <Fragment key={it.id}>
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
                        {it.matchTime ? `${it.matchTime}${it.stadiumName ? ` · ${it.stadiumName}` : ''}` : '—'}
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
          <p className="mt-4 text-sm text-muted">기간 내 발송/제외 이력이 없습니다.</p>
        )}
      </section>
    </div>
  );
}
