import type { Metadata } from 'next';

import { MessagesScreen } from '@/components/MessagesScreen';
import { getServerT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t('messages.title'),
    robots: { index: false, follow: false },
  };
}

export default function MessagesPage() {
  return <MessagesScreen />;
}
