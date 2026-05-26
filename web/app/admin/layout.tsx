import Link from 'next/link';
import type { ReactNode } from 'react';

const TABS = [
  { href: '/admin/config', label: '운영자 설정' },
  { href: '/admin/export', label: '발송 관리' },
  { href: '/admin/export/history', label: '발송 이력' },
  { href: '/admin/run', label: '수동 추출' },
  { href: '/admin/funnel', label: 'Funnel 리포트' },
  { href: '/admin/stats', label: '추출 통계' },
  { href: '/admin/surveys', label: '설문 응답' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <nav className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="px-3 py-2 text-sm font-medium text-muted hover:text-ink"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
