import type { Metadata } from 'next';

import { BankAccountScreen } from '@/components/BankAccountScreen';

export const metadata: Metadata = {
  title: '振込口座',
  robots: { index: false, follow: false },
};

export default function BankAccountPage() {
  return <BankAccountScreen />;
}
