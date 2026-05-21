import { StatsView } from '../../../components/stats-view';
import { serverFetch, type StatsReport } from '../../../lib/api';

export default async function StatsPage(props: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await props.searchParams;
  const qs = new URLSearchParams();
  if (sp.from) qs.set('from', sp.from);
  if (sp.to) qs.set('to', sp.to);

  const r = await serverFetch<StatsReport>(`/api/admin/stats?${qs.toString()}`);
  if (!r.ok) {
    return <p className="text-danger">통계를 불러오지 못했습니다.</p>;
  }
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">추출 통계</h1>
        <p className="mt-1 text-sm text-muted">
          기간: {r.data.range.from} ~ {r.data.range.to}
        </p>
      </header>
      <StatsView report={r.data} />
    </div>
  );
}
