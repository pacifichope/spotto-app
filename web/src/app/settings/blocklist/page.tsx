import type { Metadata } from 'next';

import { BlocklistScreen } from '@/components/BlocklistScreen';
import { getServerT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t('settings.blocklist'),
    robots: { index: false, follow: false },
  };
}

export default function BlocklistPage() {
  return <BlocklistScreen />;
}
