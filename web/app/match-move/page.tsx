import { ActionView, KeepOnlyView } from '../../components/action-buttons';
import { StatusBanner } from '../../components/status-banner';
import { serverFetch, type MatchMoveState } from '../../lib/api';

type PageProps = {
  searchParams: Promise<{ t?: string }>;
};

export default async function MatchMovePage(props: PageProps) {
  const sp = await props.searchParams;
  const token = sp.t ?? '';
  if (!token) {
    return (
      <Wrap title="매치 이동 안내">
        <StatusBanner tone="danger">잘못된 접근입니다.</StatusBanner>
      </Wrap>
    );
  }

  const result = await serverFetch<MatchMoveState>(
    `/api/match-move/state?t=${encodeURIComponent(token)}`,
  );
  if (!result.ok) {
    return (
      <Wrap title="매치 이동 안내">
        <StatusBanner tone="danger">일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.</StatusBanner>
      </Wrap>
    );
  }
  const state = result.data;

  if (state.status === 'invalid_token') {
    return (
      <Wrap title="매치 이동 안내">
        <StatusBanner tone="danger">잘못된 접근입니다.</StatusBanner>
      </Wrap>
    );
  }
  if (state.status === 'deadline_passed') {
    return (
      <Wrap title="매치 이동 안내">
        <StatusBanner tone="warning">변경 가능 시간이 종료되었습니다.</StatusBanner>
      </Wrap>
    );
  }
  if (state.status === 'already_actioned') {
    return (
      <Wrap title="매치 이동 안내">
        <StatusBanner tone="info">이미 응답이 접수되었습니다.</StatusBanner>
      </Wrap>
    );
  }
  if (state.status === 'no_recommendations') {
    return (
      <Wrap title="매치 이동 안내">
        <KeepOnlyView token={token} current={state.current} />
      </Wrap>
    );
  }
  return (
    <Wrap title="매치 이동 안내">
      <ActionView token={token} current={state.current} recommendations={state.recommendations} />
    </Wrap>
  );
}

function Wrap({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">진행 가능성이 높은 매치를 추천드립니다.</p>
      </header>
      {children}
    </div>
  );
}
