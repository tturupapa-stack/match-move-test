import { ExportHistoryView } from '../../../../components/export-history-view';
import { serverFetch, type ExportHistoryReport } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function ExportHistoryPage(props: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await props.searchParams;
  const qs = new URLSearchParams();
  if (sp.from) qs.set('from', sp.from);
  if (sp.to) qs.set('to', sp.to);

  const r = await serverFetch<ExportHistoryReport>(`/api/admin/export/history?${qs.toString()}`);
  if (!r.ok) {
    return <p className="text-danger">발송 이력을 불러오지 못했습니다.</p>;
  }
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">발송 이력</h1>
        <p className="mt-1 text-sm text-muted">
          기간: {r.data.range.from} ~ {r.data.range.to} (기본 최근 30일)
        </p>
      </header>
      <ExportHistoryView report={r.data} />
    </div>
  );
}
