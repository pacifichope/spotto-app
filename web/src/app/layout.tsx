import type { Metadata } from 'next';

import { AppShell } from '@/components/AppShell';
import { Providers } from '@/components/Providers';
import { BottomNav, SiteHeader } from '@/components/SiteNav';
import { firebasePublicConfig, siteUrl } from '@/lib/env';
import { getRequestLocale, getServerT } from '@/lib/i18n/server';

import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: { default: 'spotto', template: '%s | spotto' },
    description: t('meta.siteDescription'),
    metadataBase: new URL(siteUrl()),
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getRequestLocale();
  // サーバー側で .env.local を読み、クライアントへ props で渡す（埋め込み漏れ対策）
  const firebaseConfig = firebasePublicConfig();

  return (
    <html lang={locale}>
      <body>
        <Providers firebaseConfig={firebaseConfig}>
          <div className="app-bg">
            <SiteHeader />
            <AppShell>{children}</AppShell>
            <BottomNav />
          </div>
        </Providers>
      </body>
    </html>
  );
}
