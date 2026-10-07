import type { MetadataRoute } from 'next';

import { listPublicEvents } from '@/lib/events';
import { siteUrl } from '@/lib/env';

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  let events: { id: string }[] = [];
  try {
    events = await listPublicEvents();
  } catch {
    events = [];
  }
  return [
    { url: base, changeFrequency: 'hourly', priority: 1 },
    ...events.map((event) => ({
      url: `${base}/event/${event.id}`,
      changeFrequency: 'hourly' as const,
      priority: 0.8,
    })),
  ];
}
