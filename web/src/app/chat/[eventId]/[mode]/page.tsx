import type { Metadata } from 'next';

import { getServerT } from '@/lib/i18n/server';
import { Suspense } from 'react';

import { ChatRoomScreen } from '@/components/ChatRoomScreen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t('chat.titleFallback'),
    robots: { index: false, follow: false },
  };
}

export default async function ChatPage() {
  const t = await getServerT();
  return (
    <Suspense
      fallback={
        <main className="page-main pt-4 text-sm font-bold text-[#8A9199]">{t('chat.loading')}</main>
      }
    >
      <ChatRoomScreen />
    </Suspense>
  );
}
