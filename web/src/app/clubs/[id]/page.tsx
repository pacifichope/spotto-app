import type { Metadata } from 'next';

import { ClubDetailScreen } from '@/components/ClubDetailScreen';

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const clubId = decodeURIComponent(id || '').trim();
  return {
    title: clubId ? 'クラブ詳細' : 'クラブが見つかりません',
    robots: { index: false, follow: false },
  };
}

export default async function ClubDetailPage({ params }: PageProps) {
  const { id } = await params;
  const clubId = decodeURIComponent(id || '').trim();
  return <ClubDetailScreen clubId={clubId} />;
}
