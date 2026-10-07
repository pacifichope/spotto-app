import type { Metadata } from 'next';

import { ContactScreen } from '@/components/ContactScreen';

export const metadata: Metadata = {
  title: 'お問い合わせ',
  robots: { index: false, follow: false },
};

export default function ContactPage() {
  return <ContactScreen />;
}
