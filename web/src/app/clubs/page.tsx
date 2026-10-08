import type { Metadata } from 'next';

import { ClubsScreen } from '@/components/ClubsScreen';
import { getServerT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t('clubs.title'),
    robots: { index: false, follow: false },
  };
}

export default function ClubsPage() {
  return <ClubsScreen />;
}
