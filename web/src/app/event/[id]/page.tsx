import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { BookPanel } from '@/app/event/[id]/book-panel';
import { EventAttendeesSection } from '@/components/EventAttendeesSection';
import { sportCover } from '@/constants/theme';
import { getPublicEvent, listPublicEvents } from '@/lib/events';
import {
  absoluteImageUrl,
  eventAnswer,
  eventJsonLd,
  eventMetadata,
  formatPrice,
  formatWhen,
} from '@/lib/eventSeo';

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
  if (!event) {
    return {
      title: 'イベントが見つかりません',
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
  const photo = absoluteImageUrl(event.imageUri);
  const gallery = photo ? [photo, sportCover(event.sport)].filter((src, index, all) => all.indexOf(src) === index) : [sportCover(event.sport)];
  const open = event.capacity <= 0 || event.joinedCount < event.capacity;

  return (
    <main className="pb-36 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-start lg:gap-8 lg:pb-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <article>
        <nav aria-label="パンくず" className="mb-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[#5B6B75] transition-colors hover:text-[#12B8D0]"
          >
            <span aria-hidden>←</span>
            イベント一覧に戻る
          </Link>
        </nav>

        <div className="flex gap-3 overflow-x-auto [scrollbar-width:none] lg:grid lg:grid-cols-2 lg:overflow-visible">
          {gallery.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt={event.title}
              className="hero card-shadow h-56 w-[86%] shrink-0 rounded-3xl lg:h-72 lg:w-full"
            />
          ))}
        </div>

        <div className="pt-4">
          <p className="text-xs font-extrabold text-[#12B8D0]">
            <Link href="/" className="hover:underline">
              イベント一覧
            </Link>
            {event.sport ? (
              <>
                <span className="mx-1.5 text-[#8A9199]" aria-hidden>
                  /
                </span>
                <span>{event.sport}</span>
              </>
            ) : null}
          </p>
          <div className="mt-2 flex items-start justify-between gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight">{event.title}</h1>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold text-white ${open ? 'brand-gradient' : 'bg-[#8A9199]'}`}>
              {open ? '募集中' : '満員'}
            </span>
          </div>

          <section aria-label="イベントの要点" className="card-shadow mt-4 p-4">
            <p className="answer">{eventAnswer(event)}</p>
            <dl className="facts">
              <div>
                <dt>日時</dt>
                <dd>{formatWhen(event.eventDate, event.eventTime)}</dd>
              </div>
              <div>
                <dt>場所</dt>
                <dd>{event.location || '場所未定'}</dd>
              </div>
              <div>
                <dt>料金</dt>
                <dd>{formatPrice(event.priceYen)}</dd>
              </div>
              <div>
                <dt>対象レベル</dt>
                <dd>{event.level || '指定なし'}</dd>
              </div>
            </dl>
          </section>

          {event.description ? (
            <p className="mt-4 text-sm font-medium leading-7 text-[#5B6B75]">{event.description}</p>
          ) : null}

          <EventAttendeesSection
            eventId={event.id}
            hostId={event.hostId}
            hostName={event.hostName}
            capacity={event.capacity}
            joinedCountFallback={event.joinedCount}
          />
        </div>
      </article>
      <Suspense fallback={null}>
        <BookPanel event={event} />
      </Suspense>
    </main>
  );
}
