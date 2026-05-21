import type { StatsReport } from '@shared/api';

export function StatsView({ report }: { report: StatsReport }) {
  const { recommended, areas } = report;
  const maxDist = Math.max(1, ...recommended.distribution.map((d) => d.targets));
  const maxArea = Math.max(1, ...areas.map((a) => a.targets));

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">대상당 제안된 추천 매치 수</h2>
        <dl className="mt-3 flex gap-8 text-sm">
          <div>
            <dt className="text-muted">추출 대상</dt>
            <dd className="text-2xl font-bold tabular-nums">{recommended.targets}</dd>
          </div>
          <div>
            <dt className="text-muted">평균 추천 수</dt>
            <dd className="text-2xl font-bold tabular-nums">{recommended.avg.toFixed(1)}</dd>
          </div>
        </dl>
        {recommended.distribution.length > 0 ? (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1">추천 매치 수</th>
                <th className="py-1 text-right">대상 건수</th>
                <th className="py-1 pl-4">분포</th>
              </tr>
            </thead>
            <tbody>
              {recommended.distribution.map((d) => (
                <tr key={d.count} className="border-t border-line">
                  <td className="py-2 tabular-nums">{d.count}개</td>
                  <td className="py-2 text-right tabular-nums">{d.targets}</td>
                  <td className="py-2 pl-4">
                    <div
                      className="h-3 rounded bg-brand"
                      style={{ width: `${(d.targets / maxDist) * 100}%` }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-4 text-sm text-muted">집계할 데이터가 없습니다.</p>
        )}
      </section>

      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">현재 매치 지역구 분포</h2>
        {areas.length > 0 ? (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1">지역구</th>
                <th className="py-1 text-right">대상 건수</th>
                <th className="py-1 pl-4">분포</th>
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => (
                <tr key={`${a.areaId ?? 'na'}-${a.areaName}`} className="border-t border-line">
                  <td className="py-2">{a.areaName}</td>
                  <td className="py-2 text-right tabular-nums">{a.targets}</td>
                  <td className="py-2 pl-4">
                    <div
                      className="h-3 rounded bg-accent"
                      style={{ width: `${(a.targets / maxArea) * 100}%` }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-4 text-sm text-muted">집계할 데이터가 없습니다.</p>
        )}
      </section>
    </div>
  );
}
