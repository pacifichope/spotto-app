import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { BookPanel } from '@/app/event/[id]/book-panel';
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
  const image = absoluteImageUrl(event.imageUri);

  return (
    <main className="wrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <article>
        <p className="kicker">
          <Link href="/">spotto</Link>
          {event.sport ? ` · ${event.sport}` : ''}
        </p>
        <h1>{event.title}</h1>
        <section aria-label="イベントの要点">
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
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="hero" src={image} alt={event.title} />
        ) : null}
        {event.description ? <p className="lead">{event.description}</p> : null}
        {event.hostName ? <p className="meta">主催 {event.hostName}</p> : null}
      </article>
      <Suspense fallback={null}>
        <BookPanel event={event} />
      </Suspense>
    </main>
  );
}
