import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: '매치 이동 안내',
  description: '매니저 매치 이동 가설 검증 테스트',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen">
        <main className="px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
