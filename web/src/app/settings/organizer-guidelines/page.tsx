import type { Metadata } from 'next';

import { OrganizerGuidelinesScreen } from '@/components/OrganizerGuidelinesScreen';
import { getServerT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t('guidelines.title'),
    robots: { index: false, follow: false },
  };
}

export default function OrganizerGuidelinesPage() {
  return <OrganizerGuidelinesScreen />;
}
