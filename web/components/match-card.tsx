import type { CurrentMatch, RecommendedMatchPublic } from '@shared/api';
import { GradeBadge } from './grade-badge';

export function CurrentMatchCard({ m }: { m: CurrentMatch }) {
  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted">현재 매치</div>
        <GradeBadge grade={m.grade} />
      </div>
      <div className="mt-2 text-lg font-semibold">{m.stadiumName}</div>
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
          <div className="flex items-center gap-2">
            <div className="text-base font-semibold">{m.stadiumName}</div>
            <GradeBadge grade={m.grade} size="xs" />
          </div>
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
