import { ExportPanel, type PendingData } from '../../../components/export-panel';
import { serverFetch } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function AdminExportPage() {
  const pending = await serverFetch<PendingData>('/api/admin/export/pending');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">발송 관리</h1>
        <p className="mt-1 text-sm text-muted">비즈엠 대용량 발송 양식 다운로드 및 발송 완료 처리</p>
      </header>
      {pending.ok ? (
        <ExportPanel initial={pending.data} />
      ) : (
        <p className="text-danger">발송 대기 목록을 불러오지 못했습니다.</p>
      )}
    </div>
  );
}
