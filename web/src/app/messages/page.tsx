import type { Metadata } from 'next';

import { MessagesScreen } from '@/components/MessagesScreen';

export const metadata: Metadata = {
  title: 'メッセージ',
  robots: { index: false, follow: false },
};

export default function MessagesPage() {
  return <MessagesScreen />;
}
