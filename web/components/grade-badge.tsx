// 매치 등급(plab.match.grade) 표시 배지.
// 정수 그대로 노출 + NULL/undefined는 '미분류'. 정확한 명칭 매핑은 추후 운영 결정.
export function formatGrade(grade: number | null | undefined): string {
  if (grade == null) return '미분류';
  return `${grade}등급`;
}

export function GradeBadge({
  grade,
  size = 'sm',
}: {
  grade: number | null | undefined;
  size?: 'sm' | 'xs';
}) {
  const isUnknown = grade == null;
  const base =
    size === 'xs'
      ? 'text-[10px] px-1.5 py-0.5'
      : 'text-xs px-2 py-0.5';
  const tone = isUnknown
    ? 'border-line bg-surface text-muted'
    : 'border-brand/30 bg-brandSoft text-brand';
  return (
    <span className={`inline-flex items-center rounded-full border ${tone} ${base} font-medium tabular-nums`}>
      {formatGrade(grade)}
    </span>
  );
}
