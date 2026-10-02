import { attendeeIdByName, hostUserIdFromName } from '@/lib/attendees';
import { SPORT_IMAGE_PRESETS } from '@/lib/events';
import type { SportEvent } from '@/lib/events';
import i18n from '@/lib/i18n';
import {
  MY_ORGANIZER_ID,
  organizerDisplayName,
  type OrganizerProfile,
} from '@/lib/organizerProfile';
import { sanitizeSnsLinks, type SnsLink } from '@/lib/snsLinks';

export type ClubMember = {
  id?: string;
  name: string;
  imageUri?: string;
  role?: 'host' | 'member';
  self?: boolean;
};

export type ClubViewer = {
  id: string;
  name: string;
  imageUri?: string;
};

export function clubViewerFromUser(
  user: { id: string; name?: string } | null | undefined,
  profile: { name?: string; imageUri?: string } | null | undefined,
): ClubViewer | null {
  if (!user?.id) return null;
  return {
    id: user.id,
    name: String(profile?.name || '').trim() || user.name?.trim() || 'You',
    imageUri: profile?.imageUri,
  };
}

export function clubMembersForDisplay(
  club: Club | null | undefined,
  viewer: ClubViewer | null,
  joined: boolean,
): ClubMember[] {
  const members = Array.isArray(club?.members) ? club.members : [];
  if (!joined || !viewer) return members;
  const name = viewer.name.trim() || 'You';
  const matchIndex = members.findIndex(
    (member) =>
      (viewer.id && member.id === viewer.id) || member.name === name,
  );
  if (matchIndex >= 0) {
    return members.map((member, index) =>
      index === matchIndex
        ? {
            ...member,
            id: member.id ?? viewer.id,
            // 主催者行はクラブ側画像を維持。一般メンバーの自分だけ個人アバターを補う
            imageUri:
              member.imageUri ||
              (member.role === 'host' ? undefined : viewer.imageUri),
            self: true,
          }
        : member,
    );
  }
  return [
    ...members,
    {
      id: viewer.id,
      name,
      imageUri: viewer.imageUri,
      role: 'member',
      self: true,
    },
  ];
}

export type Club = {
  id: string;
  name: string;
  imageUri?: string;
  coverUri: string;
  bio: string;
  tag?: string;
  hostName: string;
  members: ClubMember[];
  snsLinks?: SnsLink[];
};

export function slugifyClubId(name: string | null | undefined) {
  const slug = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'club';
}

export function clubIdFromEvent(
  event: Pick<SportEvent, 'host' | 'hostId'> | null | undefined,
) {
  const hostId = String(event?.hostId || '').trim();
  if (hostId === MY_ORGANIZER_ID || hostId === 'me') return MY_ORGANIZER_ID;
  if (hostId) return hostId;
  return slugifyClubId(event?.host);
}

function members(
  hostName: string,
  extras: string[],
  hostImageUri?: string,
): ClubMember[] {
  return [
    {
      id: hostUserIdFromName(hostName),
      name: hostName,
      imageUri: hostImageUri,
      role: 'host',
    },
    ...extras.map((name) => ({
      id: attendeeIdByName(name),
      name,
      role: 'member' as const,
    })),
  ];
}

/** 既存メンバーの主催者に imageUri を付与（なければ先頭ホストへ） */
function withHostAvatar(
  list: ClubMember[] | null | undefined,
  hostName: string,
  imageUri?: string,
): ClubMember[] {
  const members = Array.isArray(list) ? list : [];
  const uri = imageUri?.trim();
  if (!uri) return members;
  let applied = false;
  const next = members.map((member) => {
    if (member.role === 'host' || (!applied && member.name === hostName)) {
      applied = true;
      return { ...member, imageUri: member.imageUri?.trim() || uri };
    }
    return member;
  });
  if (applied) return next;
  return [
    { id: hostUserIdFromName(hostName), name: hostName, imageUri: uri, role: 'host' },
    ...next,
  ];
}

export const SAMPLE_CLUBS: Club[] = [
  {
    id: 'harajuku-shuttle',
    name: 'Harajuku Shuttle',
    coverUri: SPORT_IMAGE_PRESETS['バドミントン'],
    bio: '原宿・表参道でバドミントン交流を主催。ラリーの気持ちよさと新しいつながりを大切にしています。',
    tag: 'バドミントン',
    hostName: 'Harajuku Shuttle',
    members: members('Harajuku Shuttle', ['Mika', 'Ken', 'Yui', 'Sota', 'Nao']),
  },
  {
    id: 'ebisu-night',
    name: 'Ebisu Night',
    coverUri: SPORT_IMAGE_PRESETS['フットサル'],
    bio: '恵比寿のナイトフットサル。初心者・ブランクあり歓迎の、楽しさ優先クラブです。',
    tag: 'フットサル',
    hostName: 'Ebisu Night',
    members: members('Ebisu Night', ['Ryo', 'Kana', 'Daiki', 'Mei']),
  },
  {
    id: 'gaien-tennis',
    name: 'Gaien Tennis',
    coverUri: SPORT_IMAGE_PRESETS['テニス'],
    bio: '明治神宮外苑でダブルス中心のテニス。朝ラリーからゲーム形式まで。',
    tag: 'テニス',
    hostName: 'Gaien Tennis',
    members: members('Gaien Tennis', ['Haru', 'Emi', 'Tomo']),
  },
  {
    id: 'morning-pace',
    name: 'Morning Pace',
    coverUri: SPORT_IMAGE_PRESETS['ランニング'],
    bio: '代々木公園のゆる朝ラン。会話できるペースで、コーヒー終わりつき。',
    tag: 'ランニング',
    hostName: 'Morning Pace',
    members: members('Morning Pace', ['Jun', 'Saki', 'Hiro', 'Aya', 'Leo', 'Mao']),
  },
  {
    id: 'shibuya-hoops',
    name: 'Shibuya Hoops',
    coverUri: SPORT_IMAGE_PRESETS['バスケットボール'],
    bio: '渋谷でナイトバスケ。3on3〜5on5、レベル分けしてマッチングします。',
    tag: 'バスケ',
    hostName: 'Shibuya Hoops',
    members: members('Shibuya Hoops', ['Koki', 'Ren', 'Yuna', 'Shin', 'Miu']),
  },
  {
    id: 'omotesando-flow',
    name: 'Omotesando Flow',
    coverUri: SPORT_IMAGE_PRESETS['ヨガ'],
    bio: '表参道周辺のヨガコミュニティ。ランチタイムからサンセットまで、無料回も定期開催。',
    tag: 'ヨガ',
    hostName: 'Omotesando Flow',
    members: members('Omotesando Flow', ['Hina', 'Riku', 'Momo']),
  },
  {
    id: 'tama-catch',
    name: 'Tama Catch',
    coverUri: SPORT_IMAGE_PRESETS['野球'],
    bio: '多摩川〜皇居周辺でキャッチボール会を主催。グローブ持参歓迎、初心者OK。',
    tag: '野球',
    hostName: 'Tama Catch',
    members: members('Tama Catch', ['Osamu', 'Kei', 'Nao']),
  },
  {
    id: 'yoyogi-fc',
    name: 'Yoyogi FC',
    coverUri: SPORT_IMAGE_PRESETS['サッカー'],
    bio: '代々木公園のピックアップサッカー。芝生の上で、楽しさ優先のキックオフ。',
    tag: 'サッカー',
    hostName: 'Yoyogi FC',
    members: members('Yoyogi FC', ['Taku', 'Natsuki', 'Gaku', 'Rin', 'Sho']),
    snsLinks: [
      {
        id: 'sample-ig',
        kind: 'instagram',
        url: 'https://instagram.com/',
      },
      {
        id: 'sample-x',
        kind: 'x',
        url: 'https://x.com/',
      },
      {
        id: 'sample-web',
        kind: 'web',
        url: 'https://example.com',
      },
    ],
  },
  {
    id: 'meguro-spike',
    name: 'Meguro Spike',
    coverUri: SPORT_IMAGE_PRESETS['バレーボール'],
    bio: '目黒の本気寄りバレー。経験者向けの練習マッチを主催しています。',
    tag: 'バレー',
    hostName: 'Meguro Spike',
    members: members('Meguro Spike', ['Asahi', 'Kaho']),
  },
  {
    id: 'sapporo-kick',
    name: 'Sapporo Kick',
    coverUri: SPORT_IMAGE_PRESETS['サッカー'],
    bio: '札幌・大通周辺のゆるサッカークラブ。',
    tag: 'サッカー',
    hostName: 'Sapporo Kick',
    members: members('Sapporo Kick', ['Yuta', 'Hana']),
  },
  {
    id: 'odori-pace',
    name: 'Odori Pace',
    coverUri: SPORT_IMAGE_PRESETS['ランニング'],
    bio: '中島公園をゆっくり走る札幌の朝ランクラブ。',
    tag: 'ランニング',
    hostName: 'Odori Pace',
    members: members('Odori Pace', ['Kenta', 'Mio']),
  },
  {
    id: 'osaka-castle-run',
    name: 'Osaka Castle Run',
    coverUri: SPORT_IMAGE_PRESETS['ランニング'],
    bio: '大阪城公園のナイトラン。ライトアップを眺めながら。',
    tag: 'ランニング',
    hostName: 'Osaka Castle Run',
    members: members('Osaka Castle Run', ['Sora', 'Ami']),
  },
  {
    id: 'nishi-futsal',
    name: 'Nishi Futsal',
    coverUri: SPORT_IMAGE_PRESETS['フットサル'],
    bio: '大阪西区のインドアナイトフットサル。',
    tag: 'フットサル',
    hostName: 'Nishi Futsal',
    members: members('Nishi Futsal', ['Kai', 'Fuka']),
  },
  {
    id: 'ohori-morning',
    name: 'Ohori Morning',
    coverUri: SPORT_IMAGE_PRESETS['ランニング'],
    bio: '福岡・大濠公園の周回朝ラン。',
    tag: 'ランニング',
    hostName: 'Ohori Morning',
    members: members('Ohori Morning', ['Ren', 'Kotomi']),
  },
];

const CLUB_BY_ID = new Map(SAMPLE_CLUBS.map((club) => [club.id, club]));

/** ルートパラメータやストレージから来た club id を正規化 */
export function normalizeClubId(
  raw: string | string[] | null | undefined,
): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value == null) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  try {
    // 二重デコードされうるため、安全に 1 回だけ試す
    const decoded = decodeURIComponent(trimmed);
    return decoded.trim() || trimmed;
  } catch {
    return trimmed;
  }
}

export function eventsForClub(clubId: string, events: SportEvent[] | null | undefined) {
  const id = normalizeClubId(clubId);
  if (!id) return [];
  const list = Array.isArray(events) ? events : [];
  return list.filter((event) => {
    const fromEvent = clubIdFromEvent(event);
    if (fromEvent === id) return true;
    const hostId = event.hostId?.trim();
    if (hostId && hostId === id) return true;
    // 旧データ: スラッグで参加 → 後から hostId が付いたケース
    if (slugifyClubId(event.host) === id) return true;
    return false;
  });
}

export function clubFromOrganizer(
  organizer: OrganizerProfile,
  events: SportEvent[],
  currentUserId?: string | null,
): Club {
  const name = organizerDisplayName(organizer);
  const uid = currentUserId?.trim();
  const hosted = events.filter(
    (event) =>
      (uid && event.hostId === uid) ||
      event.hostId === MY_ORGANIZER_ID ||
      event.hostId === 'me',
  );
  // サークル画像（主催プロフィール）と個人アバターは別。クラブ表示はサークル／イベント画像のみ。
  const clubImage =
    organizer.imageUri?.trim() ||
    hosted[0]?.imageUri?.trim() ||
    undefined;
  const coverUri =
    organizer.coverUri?.trim() ||
    hosted[0]?.imageUri?.trim() ||
    SPORT_IMAGE_PRESETS.default;
  return {
    id: uid || MY_ORGANIZER_ID,
    name,
    imageUri: clubImage || coverUri,
    coverUri,
    bio:
      organizer.bio.trim() ||
      i18n.t('club.defaultBioSelf'),
    tag: i18n.t('club.myCircleTag'),
    hostName: name,
    members: [
      {
        id: uid || MY_ORGANIZER_ID,
        name,
        // メンバー行の主催者はサークル画像（無ければカバー）
        imageUri: clubImage || coverUri,
        role: 'host',
      },
    ],
    snsLinks: organizer.snsLinks,
  };
}

export function resolveClub(
  clubId: string,
  events: SportEvent[],
  organizer: OrganizerProfile,
  currentUserId?: string | null,
): Club | null {
  const id = normalizeClubId(clubId);
  if (!id) return null;
  const uid = currentUserId?.trim();
  if (
    id === MY_ORGANIZER_ID ||
    id === 'me' ||
    (uid && id === uid)
  ) {
    return clubFromOrganizer(organizer, events, uid);
  }

  const catalog = CLUB_BY_ID.get(id);
  if (catalog) {
    const hosted = eventsForClub(id, events);
    const fromEvent = sanitizeSnsLinks(
      hosted[0]?.hostSnsLinks ?? hosted[0]?.hostSnsUrl,
    );
    // クラブ画像 = イベントカバー／カタログ画像。hostImageUri（個人アバター）は使わない。
    const coverUri = hosted[0]?.imageUri ?? catalog.coverUri;
    const clubImage =
      catalog.imageUri?.trim() ||
      hosted[0]?.imageUri?.trim() ||
      coverUri;
    const hostPersonal = hosted[0]?.hostImageUri?.trim() || undefined;
    return {
      ...catalog,
      coverUri,
      imageUri: clubImage,
      members: withHostAvatar(catalog.members, catalog.hostName, hostPersonal),
      snsLinks:
        catalog.snsLinks && catalog.snsLinks.length > 0
          ? catalog.snsLinks
          : fromEvent,
    };
  }

  const hosted = eventsForClub(id, events);
  const sample = hosted[0];
  if (!sample) return null;
  const hostId = sample.hostId?.trim() || id;
  const coverUri = sample.imageUri || SPORT_IMAGE_PRESETS.default;
  // クラブブランド画像はイベント画像。個人の hostImageUri はメンバー一覧の主催者のみ。
  const hostPersonal = sample.hostImageUri?.trim() || undefined;
  return {
    id: hostId,
    name: sample.host,
    imageUri: coverUri,
    coverUri,
    bio:
      sample.hostBio?.trim() ||
      i18n.t('club.defaultBioHosted', { name: sample.host }),
    tag: sample.sport,
    hostName: sample.host,
    members: members(sample.host, [], hostPersonal).map((member, index) =>
      index === 0 ? { ...member, id: hostId, imageUri: hostPersonal } : member,
    ),
    snsLinks: sanitizeSnsLinks(sample.hostSnsLinks ?? sample.hostSnsUrl),
  };
}

/**
 * 名前など最低限のフォールバック。
 * ※ 個人プロフィールの avatar はクラブ画像に使わない（メンバーの主催者行のみ）。
 */
export function clubFromPublicProfile(
  userId: string,
  profile: {
    name?: string | null;
    imageUri?: string | null;
    coverUri?: string | null;
    bio?: string | null;
  },
): Club {
  const name =
    String(profile.name || '').trim() || i18n.t('club.fallbackName');
  const coverUri =
    profile.coverUri?.trim() || SPORT_IMAGE_PRESETS.default;
  const clubImage = profile.imageUri?.trim() || coverUri;
  return {
    id: userId,
    name,
    imageUri: clubImage,
    coverUri,
    bio:
      String(profile.bio || '').trim() ||
      i18n.t('club.defaultBioHosted', { name }),
    tag: i18n.t('club.fallbackName'),
    hostName: name,
    members: [
      { id: userId, name, imageUri: clubImage, role: 'host' },
    ],
  };
}

/** clubs テーブル行を Club に反映（既存クラブ情報へマージ） */
export function applyClubRowToClub(
  club: Club,
  row: {
    name?: string | null;
    image_url?: string | null;
    cover_image_url?: string | null;
    bio?: string | null;
  } | null | undefined,
): Club {
  if (!row) return club;
  const cover =
    String(row.cover_image_url || '').trim() || club.coverUri;
  const image =
    String(row.image_url || '').trim() || club.imageUri || cover;
  const name = String(row.name || '').trim() || club.name;
  const bio = String(row.bio || '').trim() || club.bio;
  return {
    ...club,
    name,
    coverUri: cover,
    imageUri: image,
    bio,
    hostName: name || club.hostName,
  };
}
