import type { CurrentMatch, RecommendedMatch } from '@shared/api';

export function CurrentMatchCard({ m }: { m: CurrentMatch }) {
  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <div className="text-xs uppercase tracking-wide text-muted">현재 매치</div>
      <div className="mt-2 text-lg font-semibold">{m.stadiumName}</div>
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
  m: RecommendedMatch;
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
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold">{m.stadiumName}</div>
          <div className="text-sm text-muted">{m.scheduleKst}</div>
        </div>
        <div className="text-right text-sm">
          <div>
            참가자 <span className="font-semibold">{m.participantCount}</span>명
          </div>
          <div className="mt-1 flex gap-1 text-xs text-muted">
            {m.isTransferOrigin ? <span className="rounded bg-amber-100 px-1.5 py-0.5">양도</span> : null}
            {m.isPromotion ? <span className="rounded bg-blue-100 px-1.5 py-0.5">프로모션</span> : null}
          </div>
        </div>
      </div>
    </button>
  );
}
