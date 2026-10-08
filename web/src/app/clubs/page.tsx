import type { Metadata } from 'next';

import { ClubsScreen } from '@/components/ClubsScreen';

export const metadata: Metadata = {
  title: '参加したクラブ',
  robots: { index: false, follow: false },
};

export default function ClubsPage() {
  return <ClubsScreen />;
}
