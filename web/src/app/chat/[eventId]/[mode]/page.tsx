import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ChatRoomScreen } from '@/components/ChatRoomScreen';

export const metadata: Metadata = {
  title: 'チャット',
  robots: { index: false, follow: false },
};

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <main className="pt-4 text-sm font-bold text-[#8A9199]">読み込み中…</main>
      }
    >
      <ChatRoomScreen />
    </Suspense>
  );
}
