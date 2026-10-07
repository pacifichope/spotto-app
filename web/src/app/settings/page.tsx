import type { Metadata } from 'next';

import { SettingsScreen } from '@/components/SettingsScreen';

export const metadata: Metadata = {
  title: '設定',
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return <SettingsScreen />;
}
