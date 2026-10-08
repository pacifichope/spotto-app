import type { Metadata } from 'next';
import { Suspense } from 'react';

import { SettingsScreen } from '@/components/SettingsScreen';

export const metadata: Metadata = {
  title: '設定',
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <main className="page-main pt-4 md:pt-2">
          <h1 className="text-2xl font-extrabold tracking-tight">設定</h1>
          <p className="mt-4 text-sm font-bold text-[#8A9199]">読み込み中…</p>
        </main>
      }
    >
      <SettingsScreen />
    </Suspense>
  );
}
