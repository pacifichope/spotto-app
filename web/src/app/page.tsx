import { HomeScreen } from '@/components/HomeScreen';
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

  return <HomeScreen events={events} error={error} />;
}
