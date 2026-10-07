import Link from 'next/link';

import { listPublicEvents } from '@/lib/events';

export const revalidate = 300;

export default async function HomePage() {
  let events: Awaited<ReturnType<typeof listPublicEvents>> = [];
  let error = '';
  try {
    events = await listPublicEvents();
  } catch (caught) {
    error = caught instanceof Error ? caught.message : '一覧を取得できませんでした';
  }

  return (
    <main className="wrap">
      <p className="kicker">spotto</p>
      <h1>近くのスポーツに、気軽に参加。</h1>
      <p className="lead">
        開催中のイベントです。アプリが入っている端末では、詳細リンクからアプリが開きます。
      </p>
      {error ? <p className="error">{error}</p> : null}
      <div className="list">
        {events.map((event) => (
          <Link key={event.id} className="card" href={`/event/${event.id}`}>
            <strong>{event.title}</strong>
            <p className="meta">
              {[event.sport, event.eventDate, event.eventTime, event.location]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="meta price">
              {event.priceYen > 0 ? `${event.priceYen.toLocaleString('ja-JP')}円` : '無料'}
              {event.capacity > 0
                ? ` · ${event.joinedCount}/${event.capacity}人`
                : ''}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
