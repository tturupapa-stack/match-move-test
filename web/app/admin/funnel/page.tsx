import { FunnelView } from '../../../components/funnel-view';
import { serverFetch, type FunnelReport } from '../../../lib/api';

export default async function FunnelPage(props: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await props.searchParams;
  const qs = new URLSearchParams();
  if (sp.from) qs.set('from', sp.from);
  if (sp.to) qs.set('to', sp.to);

  const r = await serverFetch<FunnelReport>(`/api/admin/funnel?${qs.toString()}`);
  if (!r.ok) {
    return <p className="text-danger">리포트를 불러오지 못했습니다.</p>;
  }
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Funnel 리포트</h1>
        <p className="mt-1 text-sm text-muted">
          기간: {r.data.range.from} ~ {r.data.range.to}
        </p>
      </header>
      <FunnelView report={r.data} />
    </div>
  );
}
