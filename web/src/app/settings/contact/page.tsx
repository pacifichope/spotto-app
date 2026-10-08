import type { Metadata } from 'next';

import { ContactScreen } from '@/components/ContactScreen';
import { getServerT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t('contact.title'),
    robots: { index: false, follow: false },
  };
}

export default function ContactPage() {
  return <ContactScreen />;
}
