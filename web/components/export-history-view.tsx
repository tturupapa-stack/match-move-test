import type { ExportHistoryReport } from '@shared/api';

export function ExportHistoryView({ report }: { report: ExportHistoryReport }) {
  const { items, exportedCount, excludedCount } = report;

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
        {items.length > 0 ? (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-line">
                <th className="py-2">처리 시각</th>
                <th className="py-2">상태</th>
                <th className="py-2">매니저</th>
                <th className="py-2">현재 매치</th>
                <th className="py-2">처리자</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-line last:border-0">
                  <td className="py-2 tabular-nums text-muted">{it.occurredKst}</td>
                  <td className="py-2">
                    {it.status === 'exported' ? (
                      <span className="rounded bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                        발송 완료
                      </span>
                    ) : (
                      <span className="rounded bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                        대상 제외
                      </span>
                    )}
                  </td>
                  <td className="py-2">{it.managerName ?? `대상 #${it.targetId ?? '?'}`}</td>
                  <td className="py-2 text-muted">
                    {it.matchTime ? `${it.matchTime}${it.stadiumName ? ` · ${it.stadiumName}` : ''}` : '—'}
                  </td>
                  <td className="py-2 text-muted">{it.operator ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-4 text-sm text-muted">기간 내 발송/제외 이력이 없습니다.</p>
        )}
      </section>
    </div>
  );
}
