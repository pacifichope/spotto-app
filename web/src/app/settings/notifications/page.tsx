import type { Metadata } from 'next';

import { NotificationSettingsScreen } from '@/components/NotificationSettingsScreen';

export const metadata: Metadata = {
  title: '通知設定',
  robots: { index: false, follow: false },
};

export default function NotificationsSettingsPage() {
  return <NotificationSettingsScreen />;
}
