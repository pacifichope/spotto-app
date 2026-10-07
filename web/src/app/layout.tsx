import type { Metadata } from 'next';

import { Providers } from '@/components/Providers';
import { BottomNav, SiteHeader } from '@/components/SiteNav';
import { firebasePublicConfig, siteUrl } from '@/lib/env';

import './globals.css';

export const metadata: Metadata = {
  title: { default: 'spotto', template: '%s | spotto' },
  description: '近くのスポーツイベントを見つけて参加する',
  metadataBase: new URL(siteUrl()),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // サーバー側で .env.local を読み、クライアントへ props で渡す（埋め込み漏れ対策）
  const firebaseConfig = firebasePublicConfig();

  return (
    <html lang="ja">
      <body>
        <Providers firebaseConfig={firebaseConfig}>
          <div className="app-bg">
            <SiteHeader />
            <div className="app-shell">{children}</div>
            <BottomNav />
          </div>
        </Providers>
      </body>
    </html>
  );
}
