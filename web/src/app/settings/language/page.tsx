import type { Metadata } from 'next';

import { LanguageSettingsScreen } from '@/components/LanguageSettingsScreen';
import { getServerT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t('settings.languageScreenTitle'),
    robots: { index: false, follow: false },
  };
}

export default function LanguageSettingsPage() {
  return <LanguageSettingsScreen />;
}
