import type { Metadata } from 'next';
import { Suspense } from 'react';

import { SettingsScreen } from '@/components/SettingsScreen';
import { SettingsSkeleton } from '@/components/skeletons';
import { getServerT } from '@/lib/i18n/server';

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
          <SettingsSkeleton />
        </main>
      }
    >
      <SettingsScreen />
    </Suspense>
  );
}
