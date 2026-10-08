import type { Metadata } from 'next';

import { siteUrl, supabaseUrl } from '@/lib/env';
import type { PublicEvent } from '@/lib/types';

export function eventPageUrl(id: string) {
  return `${siteUrl()}/event/${id}`;
}

export function absoluteImageUrl(uri: string | null) {
  const raw = uri?.trim() || '';
  if (!raw || /^(file|content|blob):/i.test(raw)) return null;
  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(
      /\/storage\/v1\/object\/authenticated\//i,
      '/storage/v1/object/public/',
    );
  }
  const base = supabaseUrl();
  if (!base) return null;
  if (/^(events|profiles|contact|clubs)\//i.test(raw)) {
    return `${base}/storage/v1/object/public/event-images/${raw.replace(/^\/+/, '')}`;
  }
  return null;
}

function dateParts(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return { year: match[1], month: Number(match[2]), day: Number(match[3]) };
}

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function formatWhen(date: string, time: string, t?: TranslateFn) {
  const parts = dateParts(date);
  if (!parts) return t ? t('event.whenUnknown') : '日時未定';
  const label = t
    ? t('event.dateYmd', {
        year: parts.year,
        month: parts.month,
        day: parts.day,
      })
    : `${parts.year}年${parts.month}月${parts.day}日`;
  const clock = time.trim();
  return clock ? `${label} ${clock}` : label;
}

export function formatPrice(priceYen: number, t?: TranslateFn) {
  if (priceYen <= 0) return t ? t('common.free') : '無料';
  const amount = priceYen.toLocaleString('ja-JP');
  return t ? t('event.priceYen', { amount }) : `${amount}円`;
}

/** AI が先頭だけで引用できる一文。 */
export function eventAnswer(event: PublicEvent) {
  const when = formatWhen(event.eventDate, event.eventTime);
  const where = event.location || '場所未定';
  const level = event.level || '指定なし';
  const sport = event.sport ? `${event.sport}の` : '';
  return `${when}に、${where}で開かれる${sport}イベントです。対象レベルは${level}、料金は${formatPrice(event.priceYen)}です。`;
}

function isoDateTime(date: string, time: string) {
  const parts = dateParts(date);
  if (!parts) return undefined;
  const day = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  const clock = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!clock) return day;
  const hour = clock[1].padStart(2, '0');
  return `${day}T${hour}:${clock[2]}:00+09:00`;
}

export function eventJsonLd(event: PublicEvent) {
  const pageUrl = eventPageUrl(event.id);
  const image = absoluteImageUrl(event.imageUri);
  const startDate = isoDateTime(event.eventDate, event.eventTime);
  const endDate = isoDateTime(
    event.endDate || event.eventDate,
    event.endTime || event.eventTime,
  );
  const soldOut = event.capacity > 0 && event.joinedCount >= event.capacity;
  const placeName = event.location || '場所未定';
  const place: Record<string, unknown> = {
    '@type': 'Place',
    name: placeName,
    address: {
      '@type': 'PostalAddress',
      streetAddress: placeName,
      addressCountry: 'JP',
    },
  };
  if (event.latitude != null && event.longitude != null) {
    place.geo = {
      '@type': 'GeoCoordinates',
      latitude: event.latitude,
      longitude: event.longitude,
    };
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.description || eventAnswer(event),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: place,
    ...(image ? { image: [image] } : {}),
    organizer: {
      '@type': event.hostName ? 'Person' : 'Organization',
      name: event.hostName || 'spotto',
    },
    offers: {
      '@type': 'Offer',
      price: String(event.priceYen),
      priceCurrency: 'JPY',
      availability: soldOut
        ? 'https://schema.org/SoldOut'
        : 'https://schema.org/InStock',
      url: pageUrl,
    },
    url: pageUrl,
  };
}

export function eventMetadata(event: PublicEvent): Metadata {
  const pageUrl = eventPageUrl(event.id);
  const description = eventAnswer(event).slice(0, 160);
  const image = absoluteImageUrl(event.imageUri);
  return {
    title: event.title,
    description,
    robots: { index: true, follow: true },
    alternates: { canonical: pageUrl },
    openGraph: {
      type: 'website',
      url: pageUrl,
      siteName: 'spotto',
      locale: 'ja_JP',
      title: event.title,
      description,
      ...(image ? { images: [{ url: image, alt: event.title }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: event.title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}
