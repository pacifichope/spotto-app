import type { Metadata } from 'next';

import { BlocklistScreen } from '@/components/BlocklistScreen';

export const metadata: Metadata = {
  title: 'ブロックリスト',
  robots: { index: false, follow: false },
};

export default function BlocklistPage() {
  return <BlocklistScreen />;
}
