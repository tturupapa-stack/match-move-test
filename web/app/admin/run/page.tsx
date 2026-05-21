import { RunPanel } from '../../../components/run-panel';

export const dynamic = 'force-dynamic';

export default function AdminRunPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">수동 추출 테스트</h1>
        <p className="mt-1 text-sm text-muted">
          매치 시각·기준값을 바꿔가며 추출 배치를 실행 (미리보기 / 실제 저장)
        </p>
      </header>
      <RunPanel />
    </div>
  );
}
