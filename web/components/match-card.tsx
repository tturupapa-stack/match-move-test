// 매니저(추천 페이지)에 노출되는 매치 카드.
// 등급(grade)·양도/프로모션 여부는 의도적으로 표시하지 않는다 — 관리자 전용 정보.
import type { CurrentMatchPublic, RecommendedMatchPublic } from '@shared/api';
import { formatStadium } from '../lib/format';

export function CurrentMatchCard({ m }: { m: CurrentMatchPublic }) {
  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <div className="text-xs uppercase tracking-wide text-muted">현재 매치</div>
      <div className="mt-2 text-lg font-semibold">{formatStadium(m.stadiumName, m.fieldName)}</div>
      {m.areaName ? <div className="mt-0.5 text-xs text-muted">{m.areaName}</div> : null}
      <div className="mt-1 text-sm text-muted">{m.scheduleKst}</div>
      <div className="mt-3 text-sm">
        참가자 <span className="font-semibold">{m.participantCount}</span>명
      </div>
    </div>
  );
}

export function RecommendedMatchCard({
  m,
  selected,
  onSelect,
}: {
  m: RecommendedMatchPublic;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border p-4 text-left transition ${
        selected ? 'border-brand bg-brandSoft' : 'border-line bg-white hover:border-brand'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold">{formatStadium(m.stadiumName, m.fieldName)}</div>
          <div className="text-sm text-muted">{m.scheduleKst}</div>
        </div>
        <div className="text-right text-sm shrink-0">
          <div>
            참가자 <span className="font-semibold">{m.participantCount}</span>명
          </div>
        </div>
      </div>
    </button>
  );
}
