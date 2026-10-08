import type { Metadata } from 'next';

import { getServerT } from '@/lib/i18n/server';
import { Suspense } from 'react';

import { SettingsScreen } from '@/components/SettingsScreen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t('settings.title'),
    robots: { index: false, follow: false },
  };
}

export default async function SettingsPage() {
  const t = await getServerT();
  return (
    <Suspense
      fallback={
        <main className="page-main pt-4 md:pt-2">
          <h1 className="text-2xl font-extrabold tracking-tight">{t('settings.title')}</h1>
          <p className="mt-4 text-sm font-bold text-[#8A9199]">{t('common.loading')}</p>
        </main>
      }
    >
      <SettingsScreen />
    </Suspense>
  );
}
