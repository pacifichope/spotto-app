import { createAuthedSupabase, createPublicSupabase } from '@/lib/supabase';
import {
  eventColumns,
  mapEventRow,
  type EventRow,
  type PublicEvent,
} from '@/lib/types';

/** Client-safe public event fetch (avoids React `cache` from server module). */
export async function fetchPublicEventForTicket(
  eventId: string,
): Promise<PublicEvent | null> {
  const id = eventId.trim();
  if (!id) return null;
  const supabase = createPublicSupabase();
  const { data, error } = await supabase
    .from('events')
    .select(eventColumns())
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapEventRow(data as unknown as EventRow);
}

export type MyParticipantTicket = {
  id: string;
  eventId: string;
  userId: string;
  ticketQuantity: number;
  createdAt: string;
};

export function ticketHref(eventId: string) {
  const id = String(eventId || '').trim();
  return id ? `/ticket/${encodeURIComponent(id)}` : '/mypage';
}

const SPORT_EMOJI: Record<string, string> = {
  サッカー: '⚽️',
  バスケ: '🏀',
  バスケットボール: '🏀',
  テニス: '🎾',
  ランニング: '🏃',
  フットサル: '⚽️',
  バドミントン: '🏸',
  バレー: '🏐',
  バレーボール: '🏐',
  その他: '📌',
};

export function sportEmoji(sport: string) {
  const key = sport.trim();
  return SPORT_EMOJI[key] || '🏅';
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function clockLabel(time: string) {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return time.trim();
  return `${pad2(Number(match[1]))}:${match[2]}`;
}

function dateSlash(date: string) {
  const match = date.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return date.trim();
  return `${match[1]}/${pad2(Number(match[2]))}/${pad2(Number(match[3]))}`;
}

/** 例: 2026/10/17 13:00 ~ 15:00 */
export function formatTicketSchedule(event: PublicEvent) {
  const startDate = dateSlash(event.eventDate);
  const startTime = clockLabel(event.eventTime);
  if (!startDate && !startTime) return '';

  const endDateRaw = event.endDate.trim();
  const endTimeRaw = event.endTime.trim();
  const endTime = endTimeRaw ? clockLabel(endTimeRaw) : '';
  const sameDay = !endDateRaw || endDateRaw === event.eventDate.trim();

  if (startTime && endTime && sameDay) {
    return `${startDate} ${startTime} ~ ${endTime}`.trim();
  }
  if (endDateRaw && endTime) {
    return `${startDate} ${startTime} ~ ${dateSlash(endDateRaw)} ${endTime}`.trim();
  }
  if (startTime) return `${startDate} ${startTime}`.trim();
  return startDate;
}

export function formatBookedAt(iso: string | null | undefined) {
  const raw = String(iso || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export async function fetchMyParticipantTicket(input: {
  eventId: string;
  userId: string;
  getIdToken: () => Promise<string | null>;
}): Promise<MyParticipantTicket | null> {
  const eventId = input.eventId.trim();
  const userId = input.userId.trim();
  if (!eventId || !userId) return null;

  const supabase = createAuthedSupabase(input.getIdToken);
  const { data, error } = await supabase
    .from('event_participants')
    .select('id, event_id, user_id, status, created_at, ticket_quantity')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const status = String((data as { status?: string }).status || '').toLowerCase();
  if (status && status !== 'joined' && status !== 'confirmed') return null;

  return {
    id: String((data as { id?: string }).id || ''),
    eventId: String((data as { event_id?: string }).event_id || eventId),
    userId: String((data as { user_id?: string }).user_id || userId),
    ticketQuantity: Math.max(
      1,
      Math.floor(Number((data as { ticket_quantity?: number }).ticket_quantity) || 1),
    ),
    createdAt: String((data as { created_at?: string }).created_at || ''),
  };
}
