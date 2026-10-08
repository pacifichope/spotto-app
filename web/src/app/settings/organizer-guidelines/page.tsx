import type { Metadata } from 'next';

import { OrganizerGuidelinesScreen } from '@/components/OrganizerGuidelinesScreen';

export const metadata: Metadata = {
  title: '主催ガイドライン',
  robots: { index: false, follow: false },
};

export default function OrganizerGuidelinesPage() {
  return <OrganizerGuidelinesScreen />;
}
