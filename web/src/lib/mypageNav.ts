export type MyPageMode = 'participant' | 'organizer';

export type MyPageSegment =
  | 'joined'
  | 'past'
  | 'favorites'
  | 'hosted'
  | 'drafts';

/** URL の mode / tab から参加者・主催者モードを復元 */
export function parseMyPageMode(
  searchParams: URLSearchParams | { get: (key: string) => string | null },
): MyPageMode {
  const raw = (
    searchParams.get('mode') ||
    searchParams.get('tab') ||
    ''
  )
    .trim()
    .toLowerCase();
  if (
    raw === 'organizer' ||
    raw === 'host' ||
    raw === 'hosted' ||
    raw === '主催者'
  ) {
    return 'organizer';
  }
  if (
    raw === 'participant' ||
    raw === 'guest' ||
    raw === 'joined' ||
    raw === '参加者'
  ) {
    return 'participant';
  }
  return 'participant';
}

export function parseMyPageSegment(
  searchParams: URLSearchParams | { get: (key: string) => string | null },
  mode: MyPageMode,
): MyPageSegment | null {
  const raw = (searchParams.get('segment') || '').trim().toLowerCase();
  if (!raw) return null;
  if (mode === 'organizer') {
    if (raw === 'hosted' || raw === 'past' || raw === 'drafts') return raw;
    return null;
  }
  if (raw === 'joined' || raw === 'past' || raw === 'favorites') return raw;
  return null;
}

/** マイページへのリンク（モード・セグメントをクエリで保持） */
export function mypageHref(options?: {
  mode?: MyPageMode;
  segment?: MyPageSegment;
}): string {
  const params = new URLSearchParams();
  if (options?.mode) params.set('mode', options.mode);
  if (options?.segment) params.set('segment', options.segment);
  const query = params.toString();
  return query ? `/mypage?${query}` : '/mypage';
}

/** イベント詳細への遷移元（戻る先の復元用） */
export type EventNavFrom = {
  source: 'mypage';
  mode: MyPageMode;
  segment?: MyPageSegment;
};

/** イベント詳細 URL（必要なら from / mode / segment を付与） */
export function eventDetailHref(
  eventId: string,
  from?: EventNavFrom | null,
): string {
  const base = `/event/${eventId}`;
  if (!from || from.source !== 'mypage') return base;
  const params = new URLSearchParams();
  params.set('from', 'mypage');
  params.set('mode', from.mode);
  if (from.segment) params.set('segment', from.segment);
  return `${base}?${params.toString()}`;
}

/** イベント詳細の「戻る」先（未知の from は一覧へ） */
export function parseEventBackNav(
  searchParams: URLSearchParams | { get: (key: string) => string | null },
): { href: string; labelKey: 'mypage.backToMypage' | 'event.backToList' } {
  const from = (searchParams.get('from') || '').trim().toLowerCase();
  if (from === 'mypage') {
    const mode = parseMyPageMode(searchParams);
    const segment = parseMyPageSegment(searchParams, mode) ?? undefined;
    return {
      href: mypageHref({ mode, segment }),
      labelKey: 'mypage.backToMypage',
    };
  }
  return {
    href: '/',
    labelKey: 'event.backToList',
  };
}
