import type { Metadata } from 'next';

import { BottomNav } from '@/components/BottomNav';
import { siteUrl } from '@/lib/env';

import './globals.css';

export const metadata: Metadata = {
  title: { default: 'spotto', template: '%s | spotto' },
  description: '近くのスポーツイベントを見つけて参加する',
  metadataBase: new URL(siteUrl()),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <div className="app-bg">
          <div className="app-frame">
            {children}
            <BottomNav />
          </div>
        </div>
      </body>
    </html>
  );
}
