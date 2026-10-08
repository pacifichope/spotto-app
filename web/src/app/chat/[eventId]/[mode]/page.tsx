import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ChatRoomScreen } from '@/components/ChatRoomScreen';
import { ChatBubblesSkeleton } from '@/components/skeletons';
import { getServerT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t('chat.titleFallback'),
    robots: { index: false, follow: false },
  };
}

function ChatFallback() {
  return (
    <main className="page-main flex min-h-[70vh] flex-col pt-4 md:pt-2">
      <div className="space-y-2" aria-hidden>
        <span className="skeleton-bone block h-3 w-28 rounded-full" />
        <span className="skeleton-bone block h-5 w-48 rounded-full" />
      </div>
      <ChatBubblesSkeleton />
    </main>
  );
}

export default async function ChatPage() {
  return (
    <Suspense fallback={<ChatFallback />}>
      <ChatRoomScreen />
    </Suspense>
  );
}
