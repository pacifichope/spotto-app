import type { Metadata } from 'next';
import { Suspense } from 'react';

import { TicketScreen } from '@/components/TicketScreen';
import { getServerT } from '@/lib/i18n/server';

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await params;
  const t = await getServerT();
  return {
    title: t('ticket.title'),
    robots: { index: false, follow: false },
  };
}

export default function TicketPage() {
  return (
    <Suspense
      fallback={
        <main className="page-main flex min-h-[40vh] items-center justify-center pt-8">
          <p className="text-sm font-bold text-[#8A9199]">…</p>
        </main>
      }
    >
      <TicketScreen />
    </Suspense>
  );
}
