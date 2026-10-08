import { HomeScreen } from '@/components/HomeScreen';
import { listPublicEvents } from '@/lib/events';
import { getServerT } from '@/lib/i18n/server';

export const revalidate = 300;

export default async function HomePage() {
  const t = await getServerT();
  let events: Awaited<ReturnType<typeof listPublicEvents>> = [];
  let error = '';
  try {
    events = await listPublicEvents();
  } catch (caught) {
    error = caught instanceof Error ? caught.message : t('home.listFailed');
  }

  return <HomeScreen events={events} error={error} />;
}
