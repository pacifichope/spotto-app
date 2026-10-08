import type { Metadata } from 'next';

import { SalesScreen } from '@/components/SalesScreen';

export const metadata: Metadata = {
  title: '売上',
  robots: { index: false, follow: false },
};

export default function SalesPage() {
  return <SalesScreen />;
}
