import type { ReactNode } from 'react';

export function StatusBanner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  children: ReactNode;
}) {
  const toneMap: Record<string, string> = {
    info: 'bg-brandSoft text-brand border-brand/30',
    success: 'bg-brandSoft text-brand border-brand/30',
    warning: 'bg-amber-50 text-warning border-warning/30',
    danger: 'bg-red-50 text-danger border-danger/30',
  };
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${toneMap[tone]}`}>{children}</div>
  );
}
