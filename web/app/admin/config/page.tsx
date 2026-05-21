import { ConfigForm } from '../../../components/config-form';
import {
  serverFetch,
  type AdminConfig,
  type AdminSchedule,
  type PromotionMap,
} from '../../../lib/api';

export default async function AdminConfigPage() {
  const cfg = await serverFetch<AdminConfig>('/api/admin/config');
  const pm = await serverFetch<PromotionMap>('/api/admin/promotion-map');
  const sched = await serverFetch<AdminSchedule>('/api/admin/schedule');

  if (!cfg.ok || !pm.ok || !sched.ok) {
    return <p className="text-danger">설정 정보를 불러오지 못했습니다.</p>;
  }
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">운영자 설정</h1>
        <p className="mt-1 text-sm text-muted">기준값 · 프로모션 금액 · 추출 운영 시간대</p>
      </header>
      <ConfigForm initial={cfg.data} initialPromotionMap={pm.data} initialSchedule={sched.data} />
    </div>
  );
}
