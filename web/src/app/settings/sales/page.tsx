import type { Metadata } from 'next';

import { SalesScreen } from '@/components/SalesScreen';
import { getServerT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t('sales.title'),
    robots: { index: false, follow: false },
  };
}

export default function SalesPage() {
  return <SalesScreen />;
}
