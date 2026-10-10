import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CheckoutConfirmScreen } from '@/components/CheckoutConfirmScreen';
import { getPublicEvent } from '@/lib/events';
import { getServerT } from '@/lib/i18n/server';

export const revalidate = 300;
export const dynamic = 'force-static';
export const dynamicParams = true;

type PageProps = {
  params: Promise<{ id: string }>;
};

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
  return {
    title: t('payment.title'),
    robots: { index: false, follow: false },
  };
}

export default async function EventCheckoutPage({ params }: PageProps) {
  const { id } = await params;
  const event = await getPublicEvent(id);
  if (!event) notFound();
  return <CheckoutConfirmScreen event={event} />;
}
