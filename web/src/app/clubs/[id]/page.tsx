import type { Metadata } from 'next';

import { ClubDetailScreen } from '@/components/ClubDetailScreen';
import { getServerT } from '@/lib/i18n/server';

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const clubId = decodeURIComponent(id || '').trim();
  const t = await getServerT();
  return {
    title: clubId ? t('meta.clubDetail') : t('clubs.notFound'),
    robots: { index: false, follow: false },
  };
}

export default async function ClubDetailPage({ params }: PageProps) {
  const { id } = await params;
  const clubId = decodeURIComponent(id || '').trim();
  return <ClubDetailScreen clubId={clubId} />;
}
