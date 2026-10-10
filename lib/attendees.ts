import i18n from '@/lib/i18n';
import { MY_ORGANIZER_ID } from '@/lib/organizerProfile';

export type EventAttendee = {
  id: string;
  name: string;
  imageUri?: string;
  /** 個人プロフィールの性別（設定済みの場合） */
  gender?: '男性' | '女性';
  clubIds?: string[];
  self?: boolean;
  /** 保有チケット枚数（席数）。未設定時は 1 扱い */
  ticketQuantity?: number;
};

/** 表示用に正規化したチケット枚数（最低 1） */
export function attendeeTicketQuantity(
  attendee: Pick<EventAttendee, 'ticketQuantity'>,
) {
  return Math.max(1, Math.floor(Number(attendee.ticketQuantity) || 1));
}

export function hostUserIdFromName(hostName: string | null | undefined) {
  return `host:${String(hostName || '').trim() || '主催者'}`;
}

/** イベント主催者の参加者 ID（表示用。host:名前 形式を含む） */
export function eventHostAttendeeId(event: {
  host?: string | null;
  hostId?: string | null;
}) {
  const hostId = String(event.hostId || '').trim();
  if (hostId && hostId !== MY_ORGANIZER_ID && hostId !== 'me') {
    return hostId;
  }
  return hostUserIdFromName(event.host);
}

/** 参加者一覧上で主催者かどうかを判定 */
export function isEventHostAttendee(
  attendee: Pick<EventAttendee, 'id' | 'name' | 'self'>,
  event: { host?: string | null; hostId?: string | null },
) {
  const hostName = String(event.host || '').trim();
  const hostAttendeeId = eventHostAttendeeId(event);
  const attendeeName = String(attendee.name || '').trim();

  if (attendee.id === hostAttendeeId) return true;
  if (hostName && attendee.id === hostUserIdFromName(hostName)) return true;
  if (event.hostId && attendee.id === event.hostId) return true;

  // シードされた主催者エントリ（id が host:名前）
  if (
    hostName &&
    attendeeName === hostName &&
    String(attendee.id || '').startsWith('host:')
  ) {
    return true;
  }

  // 自分が主催で、一覧に viewer（self）として載っている場合
  if (attendee.self) {
    const hostId = event.hostId?.trim();
    if (
      hostId === MY_ORGANIZER_ID ||
      hostId === 'me' ||
      (hostId && attendee.id === hostId)
    ) {
      return true;
    }
  }

  return false;
}

export function attendeeIdByName(name: string | null | undefined) {
  const trimmed = String(name || '').trim();
  const match = ATTENDEE_POOL.find((person) => person.name === trimmed);
  return match?.id ?? `name:${trimmed.toLowerCase() || 'unknown'}`;
}

export const ATTENDEE_POOL: EventAttendee[] = [
  {
    id: 'mika',
    name: 'Mika',
    gender: '女性',
    clubIds: ['harajuku-shuttle'],
  },
  {
    id: 'ken',
    name: 'Ken',
    gender: '男性',
    clubIds: ['harajuku-shuttle', 'shibuya-hoops'],
  },
  {
    id: 'yui',
    name: 'Yui',
    gender: '女性',
    clubIds: ['harajuku-shuttle', 'morning-pace'],
  },
  {
    id: 'sota',
    name: 'Sota',
    gender: '男性',
    clubIds: ['harajuku-shuttle'],
  },
  {
    id: 'nao',
    name: 'Nao',
    gender: '女性',
    clubIds: ['harajuku-shuttle', 'ebisu-night'],
  },
  {
    id: 'ryo',
    name: 'Ryo',
    gender: '男性',
    clubIds: ['ebisu-night'],
  },
  {
    id: 'kana',
    name: 'Kana',
    gender: '女性',
    clubIds: ['ebisu-night', 'nishi-futsal'],
  },
  {
    id: 'daiki',
    name: 'Daiki',
    gender: '男性',
    clubIds: ['ebisu-night', 'yoyogi-fc'],
  },
  {
    id: 'mei',
    name: 'Mei',
    gender: '女性',
    clubIds: ['ebisu-night'],
  },
  {
    id: 'haru',
    name: 'Haru',
    gender: '男性',
    clubIds: ['gaien-tennis'],
  },
  {
    id: 'emi',
    name: 'Emi',
    gender: '女性',
    clubIds: ['gaien-tennis'],
  },
  {
    id: 'tomo',
    name: 'Tomo',
    gender: '男性',
    clubIds: ['gaien-tennis', 'morning-pace'],
  },
  {
    id: 'jun',
    name: 'Jun',
    gender: '男性',
    clubIds: ['morning-pace'],
  },
  {
    id: 'saki',
    name: 'Saki',
    gender: '女性',
    clubIds: ['morning-pace', 'odori-pace'],
  },
  {
    id: 'hiro',
    name: 'Hiro',
    gender: '男性',
    clubIds: ['morning-pace'],
  },
  {
    id: 'koki',
    name: 'Koki',
    gender: '男性',
    clubIds: ['shibuya-hoops'],
  },
  {
    id: 'ren',
    name: 'Ren',
    gender: '男性',
    clubIds: ['shibuya-hoops', 'ohori-morning'],
  },
  {
    id: 'yuna',
    name: 'Yuna',
    gender: '女性',
    clubIds: ['shibuya-hoops'],
  },
  {
    id: 'taku',
    name: 'Taku',
    gender: '男性',
    clubIds: ['yoyogi-fc'],
  },
  {
    id: 'natsuki',
    name: 'Natsuki',
    gender: '女性',
    clubIds: ['yoyogi-fc', 'morning-pace'],
  },
  {
    id: 'gaku',
    name: 'Gaku',
    gender: '男性',
    clubIds: ['yoyogi-fc'],
  },
  {
    id: 'asahi',
    name: 'Asahi',
    gender: '男性',
    clubIds: ['meguro-spike'],
  },
  {
    id: 'kaho',
    name: 'Kaho',
    gender: '女性',
    clubIds: ['meguro-spike'],
  },
];

type EventAttendeeSource = {
  id: string;
  joinedCount: number;
  host?: string | null;
  hostId?: string;
  hostImageUri?: string;
  attendees?: EventAttendee[];
};

function hashString(input: string | null | undefined) {
  const raw = String(input || '');
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function attendeeFromViewer(
  user: { id: string; name?: string; imageUri?: string } | null | undefined,
  profile: {
    name: string;
    imageUri?: string;
    gender?: '男性' | '女性' | '';
  },
  clubIds: string[] = [],
): EventAttendee | null {
  if (!user) return null;
  const gender =
    profile.gender === '男性' || profile.gender === '女性'
      ? profile.gender
      : undefined;
  return {
    id: user.id,
    name: profile.name.trim() || user.name?.trim() || i18n.t('events.accountFallback'),
    imageUri: profile.imageUri ?? user.imageUri,
    gender,
    clubIds,
    self: true,
  };
}

export function seedAttendees(
  event: EventAttendeeSource,
  hostClubId?: string,
): EventAttendee[] {
  const count = Math.max(0, Math.floor(Number(event.joinedCount) || 0));
  if (count === 0) return [];

  const hostName =
    String(event.host || '').trim() || i18n.t('events.host');
  const host: EventAttendee = {
    id: eventHostAttendeeId({ ...event, host: hostName }),
    name: hostName,
    imageUri: event.hostImageUri,
    clubIds: hostClubId ? [hostClubId] : undefined,
  };

  const used = new Set<string>([host.id, hostName.toLowerCase()]);
  const poolSize = Math.max(1, ATTENDEE_POOL.length);
  const start = hashString(event.id) % poolSize;
  const others: EventAttendee[] = [];
  for (let i = 0; others.length < Math.max(0, count - 1); i += 1) {
    if (ATTENDEE_POOL.length === 0) break;
    const person = ATTENDEE_POOL[(start + i) % ATTENDEE_POOL.length];
    if (!person) break;
    if (used.has(person.id) || used.has(person.name.toLowerCase())) {
      if (i > ATTENDEE_POOL.length) break;
      continue;
    }
    used.add(person.id);
    used.add(person.name.toLowerCase());
    const clubIds = hostClubId
      ? Array.from(new Set([hostClubId, ...(person.clubIds ?? [])])).slice(0, 3)
      : person.clubIds;
    others.push({ ...person, clubIds });
  }

  while (others.length < Math.max(0, count - 1)) {
    const n = others.length + 2;
    others.push({
      id: `${event.id}-plus-${n}`,
      name: i18n.t('events.attendeeSeedName', { n }),
      clubIds: hostClubId ? [hostClubId] : undefined,
    });
  }

  return [host, ...others].slice(0, count);
}

export function attendeesForDisplay(
  event: EventAttendeeSource,
  viewer: EventAttendee | null,
  joined: boolean,
  hostClubId?: string,
): EventAttendee[] {
  try {
    const joinedCount = Math.max(0, Math.floor(Number(event.joinedCount) || 0));
    // attendees が配列として渡されていれば実データ（空配列含む）。未定義のときだけシード
    const hasRealList = Array.isArray(event.attendees);
    const seeded = hasRealList
      ? event.attendees!.filter(Boolean)
      : seedAttendees(event, hostClubId);
    const withoutSelf = viewer
      ? seeded.filter((person) => person?.id && person.id !== viewer.id)
      : seeded.filter((person) => Boolean(person?.id));

    if (joined && viewer) {
      const restLimit = hasRealList
        ? withoutSelf.length
        : Math.max(0, joinedCount - 1);
      return [viewer, ...withoutSelf.slice(0, restLimit)];
    }
    if (hasRealList) return withoutSelf;
    return withoutSelf.slice(0, joinedCount);
  } catch {
    return [];
  }
}

export function attendeePreviewLabel(attendees: EventAttendee[], maxNames = 3) {
  if (attendees.length === 0) return '';
  const names = attendees
    .slice(0, maxNames)
    .map((person) => (person.self ? i18n.t('events.attendeeSelf') : person.name));
  const separator = i18n.t('events.attendeeSeparator');
  if (attendees.length <= maxNames) return names.join(separator);
  return i18n.t('events.attendeePreviewMore', {
    names: names.join(separator),
    count: attendees.length - maxNames,
  });
}
