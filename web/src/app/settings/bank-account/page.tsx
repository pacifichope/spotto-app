import type { Metadata } from 'next';

import { BankAccountScreen } from '@/components/BankAccountScreen';
import { getServerT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t('bank.title'),
    robots: { index: false, follow: false },
  };
}

export default function BankAccountPage() {
  return <BankAccountScreen />;
}
