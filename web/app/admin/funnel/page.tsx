import { FunnelView } from '../../../components/funnel-view';
import { serverFetch, type FunnelReport } from '../../../lib/api';

// 클라이언트 인터랙션(기간·일/주별)이 모두 FunnelView 안에서 처리되도록 단순화.
// 초기 데이터는 서버에서 최근 7일 합계로 한 번 prefetch해 첫 페인트 지연 줄임.
export default async function FunnelPage() {
  const r = await serverFetch<FunnelReport>('/api/admin/funnel');
  if (!r.ok) {
    return <p className="text-danger">리포트를 불러오지 못했습니다.</p>;
  }
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Funnel 리포트</h1>
        <p className="mt-1 text-sm text-muted">
          기간·일/주별 집계 단위를 변경하려면 아래 필터를 사용하세요.
        </p>
      </header>
      <FunnelView report={r.data} />
    </div>
  );
}
