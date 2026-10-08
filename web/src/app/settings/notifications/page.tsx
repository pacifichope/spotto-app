import type { Metadata } from 'next';

import { NotificationSettingsScreen } from '@/components/NotificationSettingsScreen';
import { getServerT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t('settings.notifications'),
    robots: { index: false, follow: false },
  };
}

export default function NotificationsSettingsPage() {
  return <NotificationSettingsScreen />;
}
