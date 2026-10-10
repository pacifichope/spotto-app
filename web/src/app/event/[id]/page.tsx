import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { EventDetailView } from '@/components/EventDetailView';
import { getPublicEvent, listPublicEvents } from '@/lib/events';
import { eventJsonLd, eventMetadata } from '@/lib/eventSeo';
import { getServerT } from '@/lib/i18n/server';

/** 5分ごとにサーバーで HTML を作り直す。リクエストのたびに動的描画はしない。 */
export const revalidate = 300;
export const dynamic = 'force-static';
export const dynamicParams = true;

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateStaticParams() {
  try {
    const events = await listPublicEvents();
    return events.map((event) => ({ id: event.id }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await getPublicEvent(id);
  const t = await getServerT();
  if (!event) {
    return {
      title: t('event.notFound'),
      robots: { index: false, follow: false },
    };
  }
  return eventMetadata(event);
}

export default async function EventPage({ params }: PageProps) {
  const { id } = await params;
  const event = await getPublicEvent(id);

  if (!event) notFound();

  const jsonLd = JSON.stringify(eventJsonLd(event)).replace(/</g, '\\u003c');

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <Suspense fallback={<EventDetailFallback />}>
        <EventDetailView event={event} />
      </Suspense>
    </>
  );
}

function EventDetailFallback() {
  return (
    <main className="page-main mx-auto w-full max-w-[520px] pb-36 pt-0">
      <div className="overflow-hidden md:rounded-[28px] md:ring-1 md:ring-[#E4EBEE]">
        <div className="h-56 animate-pulse bg-[#E4EBEE] sm:h-72" />
        <div className="space-y-3 px-4 py-6">
          <div className="h-6 w-3/4 rounded-full bg-[#E4EBEE]" />
          <div className="h-4 w-1/2 rounded-full bg-[#E4EBEE]" />
          <div className="h-4 w-2/3 rounded-full bg-[#E4EBEE]" />
        </div>
      </div>
    </main>
  );
}
