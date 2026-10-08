'use client';

import Link from 'next/link';
import {
  BookOpen,
  Building2,
  ChevronRight,
  Plus,
  Settings,
  Users,
  Wallet,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { LoginPromptCard } from '@/components/AuthControls';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CreateEventModal } from '@/components/CreateEventModal';
import { MyEventList } from '@/components/MyEventList';
import { OrganizerProfileModal } from '@/components/OrganizerProfileModal';
import { ProfileEditModal } from '@/components/ProfileEditModal';
import { useAuth } from '@/lib/auth-context';
import { fetchJoinedClubs } from '@/lib/clubs';
import { loadEventDrafts, type WebEventDraft } from '@/lib/eventDrafts';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import {
  fetchMyEventsBundle,
  type MyEventsBundle,
} from '@/lib/myEvents';
import {
  parseMyPageMode,
  parseMyPageSegment,
  type MyPageMode,
  type MyPageSegment,
} from '@/lib/mypageNav';
import {
  EMPTY_ORGANIZER_PROFILE,
  fetchOrganizerClubProfile,
  hasOrganizerProfileReady,
  loadOrganizerProfile,
  mergeOrganizerProfiles,
  saveOrganizerProfileLocal,
  type WebOrganizerProfile,
} from '@/lib/organizerProfile';import {
  fetchWebProfile,
  profileFromFirebaseUser,
  type WebUserProfile,
} from '@/lib/profile';

type Mode = MyPageMode;
type Segment = MyPageSegment;

const emptyBundle: MyEventsBundle = {
  joinedUpcoming: [],
  joinedPast: [],
  favorites: [],
  hostedUpcoming: [],
  hostedPast: [],
};

const shellClass = 'page-main';

export function MyPageScreen() {
  const { user, ready, busy, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const modeFromUrl = parseMyPageMode(searchParams);
  const segmentFromUrl = parseMyPageSegment(searchParams, modeFromUrl);

  const [mode, setModeState] = useState<Mode>(modeFromUrl);
  const [segment, setSegmentState] = useState<Segment>(
    () => segmentFromUrl ?? (modeFromUrl === 'organizer' ? 'hosted' : 'joined'),
  );
  const [bundle, setBundle] = useState<MyEventsBundle>(emptyBundle);
  const [drafts, setDrafts] = useState<WebEventDraft[]>([]);
  const [clubCount, setClubCount] = useState(0);
  const [loadingLists, setLoadingLists] = useState(false);
  const [listError, setListError] = useState('');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [organizerEditOpen, setOrganizerEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<WebEventDraft | null>(null);
  const [profile, setProfile] = useState<WebUserProfile>(() =>
    profileFromFirebaseUser(null),
  );
  const [organizer, setOrganizer] = useState<WebOrganizerProfile>(
    EMPTY_ORGANIZER_PROFILE,
  );

  const reloadLists = useCallback(async () => {
    if (!user) return;
    const fallback = profileFromFirebaseUser(user);
    const getIdToken = async () => idTokenWithAuthenticatedRole(user);
    const [nextBundle, nextProfile, clubs, remoteClub] = await Promise.all([
      fetchMyEventsBundle({
        userId: user.uid,
        getIdToken,
      }),
      fetchWebProfile({ userId: user.uid, fallback }),
      fetchJoinedClubs({
        userId: user.uid,
        getIdToken,
      }).catch(() => []),
      fetchOrganizerClubProfile({ userId: user.uid, getIdToken }).catch(
        () => null,
      ),
    ]);
    setBundle(nextBundle);
    setProfile(nextProfile);
    setClubCount(clubs.length);
    setDrafts(loadEventDrafts(user.uid));
    const localOrg = loadOrganizerProfile(user.uid);
    const merged = mergeOrganizerProfiles(localOrg, remoteClub);
    setOrganizer(merged);
    if (remoteClub) saveOrganizerProfileLocal(user.uid, merged);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setBundle(emptyBundle);
      setDrafts([]);
      setClubCount(0);
      setListError('');
      setProfile(profileFromFirebaseUser(null));
      setOrganizer(EMPTY_ORGANIZER_PROFILE);
      return;
    }
    let cancelled = false;
    setLoadingLists(true);
    setListError('');
    setProfile(profileFromFirebaseUser(user));
    setOrganizer(loadOrganizerProfile(user.uid));
    setDrafts(loadEventDrafts(user.uid));
    void reloadLists()
      .catch((error) => {
        if (!cancelled) {
          setBundle(emptyBundle);
          setListError(
            error instanceof Error ? error.message : '一覧の取得に失敗しました',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingLists(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, reloadLists]);

  const syncUrl = useCallback(
    (nextMode: Mode, nextSegment: Segment) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('mode', nextMode);
      params.set('segment', nextSegment);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setMode = useCallback(
    (next: Mode) => {
      const nextSegment: Segment = next === 'organizer' ? 'hosted' : 'joined';
      setModeState(next);
      setSegmentState(nextSegment);
      syncUrl(next, nextSegment);
    },
    [syncUrl],
  );

  const setSegment = useCallback(
    (next: Segment) => {
      setSegmentState(next);
      syncUrl(mode, next);
    },
    [mode, syncUrl],
  );

  // ブラウザ戻る／下層ページからの ?mode=organizer 復元
  useEffect(() => {
    const nextMode = parseMyPageMode(searchParams);
    const nextSegment =
      parseMyPageSegment(searchParams, nextMode) ??
      (nextMode === 'organizer' ? 'hosted' : 'joined');
    setModeState(nextMode);
    setSegmentState(nextSegment);
  }, [searchParams]);

  const isOrganizer = mode === 'organizer';
  const settingsHref = `/settings?from=${mode}`;

  const segments = useMemo(() => {
    if (isOrganizer) {
      return [
        { id: 'hosted' as const, label: '主催', count: bundle.hostedUpcoming.length },
        { id: 'past' as const, label: '履歴', count: bundle.hostedPast.length },
        { id: 'drafts' as const, label: '下書き', count: drafts.length },
      ];
    }
    return [
      { id: 'joined' as const, label: '参加予定', count: bundle.joinedUpcoming.length },
      { id: 'past' as const, label: '履歴', count: bundle.joinedPast.length },
      { id: 'favorites' as const, label: 'お気に入り', count: bundle.favorites.length },
    ];
  }, [isOrganizer, bundle, drafts.length]);

  const listEvents = useMemo(() => {
    if (isOrganizer) {
      if (segment === 'past') return bundle.hostedPast;
      if (segment === 'drafts') return [];
      return bundle.hostedUpcoming;
    }
    if (segment === 'past') return bundle.joinedPast;
    if (segment === 'favorites') return bundle.favorites;
    return bundle.joinedUpcoming;
  }, [isOrganizer, segment, bundle]);

  const emptyCopy = useMemo(() => {
    if (isOrganizer) {
      if (segment === 'past') {
        return {
          title: '過去の主催イベントはありません',
          body: 'これまでに主催したイベントがここに表示されます。',
        };
      }
      if (segment === 'drafts') {
        return {
          title: '下書きはありません',
          body: '作成途中のイベントを下書き保存すると、ここに表示されます。',
        };
      }
      return {
        title: '主催中のイベントはありません',
        body: '最初のイベントを作成して、参加者を集めましょう。',
      };
    }
    if (segment === 'favorites') {
      return {
        title: 'お気に入りはまだありません',
        body: '気になるイベントをお気に入り登録すると、ここに集まります。',
      };
    }
    if (segment === 'past') {
      return {
        title: '参加履歴はまだありません',
        body: '参加したイベントの履歴がここに表示されます。',
      };
    }
    return {
      title: '参加予定はありません',
      body: 'イベント詳細から予約すると、ここに参加予定が表示されます。',
    };
  }, [isOrganizer, segment]);

  const showCreateFab =
    !!user &&
    isOrganizer &&
    bundle.hostedUpcoming.length + bundle.hostedPast.length > 0;

  function openCreate(draft?: WebEventDraft | null) {
    if (!user) return;
    if (!hasOrganizerProfileReady(organizer)) {
      setOrganizerEditOpen(true);
      return;
    }
    setEditingDraft(draft ?? null);
    setCreateOpen(true);
  }

  if (!ready) {
    return (
      <main className={`${shellClass} pt-4 md:pt-2`}>
        <h1 className="text-2xl font-extrabold tracking-tight">マイページ</h1>
        <p className="mt-4 text-sm font-bold text-[#8A9199]">読み込み中…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className={`${shellClass} pt-4 md:pt-2`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">マイページ</h1>
            <p className="mt-2 text-sm font-bold text-[#8A9199]">現在：未ログイン</p>
          </div>
          <Link
            href="/settings?from=participant"
            className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#12202A] shadow-sm"
            aria-label="設定"
          >
            <Settings size={20} />
          </Link>
        </div>
        <LoginPromptCard
          title="ログインしてマイページを開く"
          body="参加予定やプロフィールは、ログイン後にこの画面で確認できます。Google・Apple・LINE のいずれかでサインインしてください。"
        />
      </main>
    );
  }

  const name = profile.name.trim() || user.displayName?.trim() || 'ユーザー';
  const email = user.email || '';
  const avatarUrl = profile.imageUri || user.photoURL || undefined;
  const organizerName = organizer.name.trim();
  const organizerReady = hasOrganizerProfileReady(organizer);

  return (
    <main className={`relative ${shellClass} pb-24 pt-4 md:pt-2`}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-0.5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">マイページ</h1>
          <p className="mt-2 text-sm font-extrabold text-[#12B8D0]">ログイン中</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={settingsHref}
            className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#12202A] shadow-sm"
            aria-label="アプリ設定"
            title="設定"
          >
            <Settings size={20} />
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => setLogoutOpen(true)}
            className="rounded-full bg-white px-4 py-2 text-sm font-extrabold text-[#5B6B75] shadow-sm disabled:opacity-60"
          >
            {busy ? '処理中…' : 'ログアウト'}
          </button>
        </div>
      </div>

      <div
        className="mt-4 flex gap-1 rounded-full bg-white/80 p-1 shadow-sm ring-1 ring-white/80"
        role="tablist"
        aria-label="マイページモード"
      >
        {(
          [
            { id: 'participant' as const, label: '参加者' },
            { id: 'organizer' as const, label: '主催者' },
          ] as const
        ).map((item) => {
          const active = mode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMode(item.id)}
              className={`flex-1 rounded-full px-4 py-2.5 text-sm font-extrabold transition ${
                active ? 'brand-gradient shadow-sm' : 'text-[#5B6B75]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {isOrganizer ? (
        <button
          type="button"
          onClick={() => setOrganizerEditOpen(true)}
          className="card-shadow mt-4 flex w-full items-center gap-4 px-5 py-5 text-left transition hover:bg-white"
        >
          {organizer.imageUri ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={organizer.imageUri}
              alt=""
              className="h-12 w-12 rounded-full object-cover"
            />
          ) : (
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[#E5F9FC] text-[#12B8D0]">
              <Users size={22} />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-extrabold tracking-tight">
              {organizerName || 'サークル情報'}
            </span>
            <span className="mt-0.5 block text-sm font-bold text-[#5B6B75]">
              {organizerReady ? 'サークル情報を編集' : 'サークル名を設定'}
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-[#8A9199]" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="card-shadow mt-4 flex w-full items-center gap-4 px-5 py-5 text-left transition hover:bg-white"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-16 w-16 rounded-full object-cover ring-2 ring-[#E5F9FC]"
            />
          ) : (
            <span className="brand-gradient grid h-16 w-16 place-items-center rounded-full text-xl font-extrabold">
              {name.slice(0, 1)}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-extrabold tracking-tight">
              {name}
            </span>
            <span className="mt-0.5 block truncate text-sm font-bold text-[#5B6B75]">
              {email || 'プロフィールを編集'}
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-[#8A9199]" />
        </button>
      )}

      {isOrganizer ? (
        <section className="card-shadow mt-3 overflow-hidden">
          {(
            [
              {
                href: '/settings/sales',
                label: '売上',
                icon: Wallet,
              },
              {
                href: '/settings/bank-account',
                label: '振込口座',
                icon: Building2,
              },
              {
                href: '/settings/organizer-guidelines',
                label: '主催ガイドライン',
                icon: BookOpen,
              },
            ] as const
          ).map((item, index) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-5 py-4 ${
                  index > 0 ? 'border-t border-[#E4EBEE]' : ''
                }`}
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[#E5F9FC] text-[#12B8D0]">
                  <Icon size={18} />
                </span>
                <span className="flex-1 text-sm font-extrabold">{item.label}</span>
                <ChevronRight size={18} className="text-[#8A9199]" />
              </Link>
            );
          })}
        </section>
      ) : (
        <Link
          href="/clubs"
          className="card-shadow mt-3 flex items-center gap-3 px-5 py-4"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#E5F9FC] text-[#12B8D0]">
            <Users size={18} />
          </span>
          <span className="text-sm font-extrabold">参加したクラブ</span>
          <span className="text-[#8A9199]">·</span>
          <span className="text-sm font-extrabold text-[#12B8D0]">{clubCount}</span>
          <ChevronRight size={18} className="ml-auto text-[#8A9199]" />
        </Link>
      )}

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist">
        {segments.map((item) => {
          const active = segment === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSegment(item.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold ${
                active
                  ? 'bg-[#12202A] text-white'
                  : 'bg-white/80 text-[#5B6B75] shadow-sm'
              }`}
            >
              {item.label}
              <span
                className={`grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] ${
                  active ? 'bg-white/20' : 'bg-[#E5F9FC] text-[#12B8D0]'
                }`}
              >
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {listError ? (
        <p className="mt-4 text-sm font-bold text-[#EF4444]">{listError}</p>
      ) : null}

      {loadingLists ? (
        <p className="mt-6 text-sm font-bold text-[#8A9199]">一覧を読み込み中…</p>
      ) : isOrganizer && segment === 'drafts' ? (
        drafts.length === 0 ? (
          <MyEventList
            events={[]}
            emptyTitle={emptyCopy.title}
            emptyBody={emptyCopy.body}
            eventFrom={{ source: 'mypage', mode, segment }}
            emptyAction={
              <button
                type="button"
                onClick={() => openCreate()}
                className="brand-gradient mt-5 inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-extrabold"
              >
                <Plus size={16} />
                イベントを作成
              </button>
            }
          />
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {drafts.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openCreate(item)}
                  className="card-shadow flex w-full items-start gap-3 p-4 text-left transition hover:bg-white"
                >
                  {item.imageUri ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUri}
                      alt=""
                      className="h-16 w-16 rounded-2xl object-cover"
                    />
                  ) : (
                    <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[#E5F9FC] text-[#12B8D0]">
                      <Plus size={20} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold">
                      {item.title.trim() || '無題の下書き'}
                    </span>
                    <span className="mt-1 block text-xs font-bold text-[#5B6B75]">
                      {[item.sport, item.date, item.location].filter(Boolean).join(' · ') ||
                        '続きから編集'}
                    </span>
                  </span>
                  <ChevronRight size={16} className="mt-1 shrink-0 text-[#8A9199]" />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <MyEventList
          events={listEvents}
          emptyTitle={emptyCopy.title}
          emptyBody={emptyCopy.body}
          eventFrom={{ source: 'mypage', mode, segment }}
          emptyAction={
            isOrganizer && segment === 'hosted' ? (
              <button
                type="button"
                onClick={() => openCreate()}
                className="brand-gradient mt-5 inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-extrabold"
              >
                <Plus size={16} />
                イベントを作成
              </button>
            ) : undefined
          }
        />
      )}

      {showCreateFab ? (
        <button
          type="button"
          onClick={() => openCreate()}
          className="brand-gradient fixed bottom-24 right-4 z-30 flex h-14 items-center gap-2 rounded-full px-5 text-sm font-extrabold shadow-[0_12px_28px_rgba(18,184,208,0.35)] md:bottom-8 md:right-8"
        >
          <Plus size={18} strokeWidth={2.5} />
          作成
        </button>
      ) : null}

      <ConfirmDialog
        open={logoutOpen}
        title="ログアウトしますか？"
        description="現在のアカウントからログアウトします。いつでも再度ログインできます。"
        confirmLabel="ログアウトする"
        busy={busy}
        onCancel={() => {
          if (!busy) setLogoutOpen(false);
        }}
        onConfirm={() => {
          void (async () => {
            await signOut();
            setLogoutOpen(false);
          })();
        }}
      />

      <ProfileEditModal
        open={editOpen}
        user={user}
        profile={profile}
        getIdToken={async () => idTokenWithAuthenticatedRole(user)}
        onClose={() => setEditOpen(false)}
        onSaved={(next) => setProfile(next)}
      />

      <OrganizerProfileModal
        open={organizerEditOpen}
        userId={user.uid}
        profile={organizer}
        getIdToken={async () => idTokenWithAuthenticatedRole(user)}
        onClose={() => setOrganizerEditOpen(false)}
        onSaved={(next) => setOrganizer(next)}
      />

      <CreateEventModal
        open={createOpen}
        userId={user.uid}
        organizer={organizer}
        draft={editingDraft}
        getIdToken={async () => idTokenWithAuthenticatedRole(user)}
        onClose={() => {
          setCreateOpen(false);
          setEditingDraft(null);
        }}
        onPublished={() => {
          setMode('organizer');
          void reloadLists();
        }}
        onDraftSaved={(next) => setDrafts(next)}
      />
    </main>
  );
}
