import type { FunnelReport } from '@shared/api';

export function FunnelView({ report }: { report: FunnelReport }) {
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
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">Funnel</h2>
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
                  {r.rate !== undefined ? `${(r.rate * 100).toFixed(1)}%` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">비용 절감 (부차 지표)</h2>
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
      </section>
    </div>
  );
}
