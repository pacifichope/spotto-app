import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { EventDetailView } from '@/components/EventDetailView';
import {
  getPublicEvent,
  listEventScheduleOccurrences,
  listPublicEvents,
} from '@/lib/events';
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

  const occurrences = await listEventScheduleOccurrences(event);
  const jsonLd = JSON.stringify(eventJsonLd(event)).replace(/</g, '\\u003c');

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <Suspense fallback={<EventDetailFallback />}>
        <EventDetailView event={event} occurrenceEvents={occurrences} />
      </Suspense>
    </>
  );
}

function EventDetailFallback() {
  return (
    <main className="page-main pb-12">
      <div className="hidden gap-6 lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
        <div className="space-y-5">
          <div className="aspect-[16/10] min-h-[320px] animate-pulse rounded-[28px] bg-[#E4EBEE]" />
          <div className="h-28 animate-pulse rounded-[28px] bg-[#E4EBEE]/80" />
        </div>
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-3xl bg-[#E4EBEE]/80" />
          <div className="h-48 animate-pulse rounded-3xl bg-[#E4EBEE]/70" />
        </div>
      </div>
      <div className="overflow-hidden rounded-[24px] ring-1 ring-[#E4EBEE] lg:hidden">
        <div className="h-56 animate-pulse bg-[#E4EBEE]" />
        <div className="space-y-3 px-4 py-6">
          <div className="h-6 w-3/4 rounded-full bg-[#E4EBEE]" />
          <div className="h-4 w-1/2 rounded-full bg-[#E4EBEE]" />
          <div className="h-4 w-2/3 rounded-full bg-[#E4EBEE]" />
        </div>
      </div>
    </main>
  );
}
