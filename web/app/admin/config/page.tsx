import { ConfigForm } from '../../../components/config-form';
import { serverFetch, type AdminConfig, type PromotionMap } from '../../../lib/api';

export default async function AdminConfigPage() {
  const cfg = await serverFetch<AdminConfig>('/api/admin/config');
  const pm = await serverFetch<PromotionMap>('/api/admin/promotion-map');

  if (!cfg.ok || !pm.ok) {
    return <p className="text-danger">설정 정보를 불러오지 못했습니다.</p>;
  }
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">운영자 설정</h1>
        <p className="mt-1 text-sm text-muted">기준값 및 프로모션 금액 매핑</p>
      </header>
      <ConfigForm initial={cfg.data} initialPromotionMap={pm.data} />
    </div>
  );
}
