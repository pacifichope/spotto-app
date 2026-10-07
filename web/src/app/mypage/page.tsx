import type { Metadata } from 'next';

import { MyPageScreen } from '@/components/MyPageScreen';

export const metadata: Metadata = {
  title: 'マイページ',
  robots: { index: false, follow: false },
};

export default function MyPage() {
  return <MyPageScreen />;
}
