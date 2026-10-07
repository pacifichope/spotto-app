'use client';

import Link from 'next/link';
import { Settings } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { LoginPromptCard } from '@/components/AuthControls';
import { MyEventList } from '@/components/MyEventList';
import { useAuth } from '@/lib/auth-context';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import {
  fetchMyEventsBundle,
  type MyEventsBundle,
} from '@/lib/myEvents';

type Mode = 'participant' | 'organizer';
type Segment = 'joined' | 'past' | 'favorites' | 'hosted';

const emptyBundle: MyEventsBundle = {
  joinedUpcoming: [],
  joinedPast: [],
  favorites: [],
  hostedUpcoming: [],
  hostedPast: [],
};

export function MyPageScreen() {
  const { user, ready, busy, signOut } = useAuth();
  const [mode, setMode] = useState<Mode>('participant');
  const [segment, setSegment] = useState<Segment>('joined');
  const [bundle, setBundle] = useState<MyEventsBundle>(emptyBundle);
  const [loadingLists, setLoadingLists] = useState(false);
  const [listError, setListError] = useState('');

  useEffect(() => {
    if (!user) {
      setBundle(emptyBundle);
      setListError('');
      return;
    }
    let cancelled = false;
    setLoadingLists(true);
    setListError('');
    void (async () => {
      try {
        const next = await fetchMyEventsBundle({
          userId: user.uid,
          getIdToken: async () => idTokenWithAuthenticatedRole(user),
        });
        if (!cancelled) setBundle(next);
      } catch (error) {
        if (!cancelled) {
          setBundle(emptyBundle);
          setListError(
            error instanceof Error ? error.message : '一覧の取得に失敗しました',
          );
        }
      } finally {
        if (!cancelled) setLoadingLists(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    setSegment(mode === 'organizer' ? 'hosted' : 'joined');
  }, [mode]);

  const segments = useMemo(() => {
    if (mode === 'organizer') {
      return [
        { id: 'hosted' as const, label: '主催', count: bundle.hostedUpcoming.length },
        { id: 'past' as const, label: '履歴', count: bundle.hostedPast.length },
      ];
    }
    return [
      { id: 'joined' as const, label: '参加予定', count: bundle.joinedUpcoming.length },
      { id: 'past' as const, label: '履歴', count: bundle.joinedPast.length },
      { id: 'favorites' as const, label: 'お気に入り', count: bundle.favorites.length },
    ];
  }, [mode, bundle]);

  const listEvents = useMemo(() => {
    if (mode === 'organizer') {
      return segment === 'past' ? bundle.hostedPast : bundle.hostedUpcoming;
    }
    if (segment === 'past') return bundle.joinedPast;
    if (segment === 'favorites') return bundle.favorites;
    return bundle.joinedUpcoming;
  }, [mode, segment, bundle]);

  const emptyCopy = useMemo(() => {
    if (mode === 'organizer') {
      return segment === 'past'
        ? {
            title: '過去の主催イベントはありません',
            body: 'これまでに主催したイベントがここに表示されます。',
          }
        : {
            title: '主催中のイベントはありません',
            body: 'イベントの作成はアプリから行えます。作成済みのイベントはここに表示されます。',
          };
    }
    if (segment === 'favorites') {
      return {
        title: 'お気に入りはまだありません',
        body: '気になるイベントをお気に入り登録すると、ここに集まります（アプリでも同期されます）。',
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
  }, [mode, segment]);

  if (!ready) {
    return (
      <main className="pt-4 md:pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">マイページ</h1>
        <p className="mt-4 text-sm font-bold text-[#8A9199]">読み込み中…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="pt-4 md:pt-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">マイページ</h1>
            <p className="mt-2 text-sm font-bold text-[#8A9199]">現在：未ログイン</p>
          </div>
          <Link
            href="/settings"
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

  const name = user.displayName?.trim() || 'ユーザー';
  const email = user.email || '';

  return (
    <main className="pt-4 md:pt-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">マイページ</h1>
          <p className="mt-2 text-sm font-extrabold text-[#12B8D0]">ログイン中</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#12202A] shadow-sm"
            aria-label="設定"
          >
            <Settings size={20} />
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => void signOut()}
            className="rounded-full bg-white px-4 py-2 text-sm font-extrabold text-[#5B6B75] shadow-sm disabled:opacity-60"
          >
            {busy ? '処理中…' : 'ログアウト'}
          </button>
        </div>
      </div>

      <div
        className="mt-4 flex gap-2 rounded-full bg-white/70 p-1 shadow-sm ring-1 ring-white/80"
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

      <section className="card-shadow mt-4 flex items-center gap-4 px-5 py-6">
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt=""
            className="h-14 w-14 rounded-full object-cover"
          />
        ) : (
          <span className="brand-gradient grid h-14 w-14 place-items-center rounded-full text-lg font-extrabold">
            {name.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold tracking-tight">{name}</p>
          {email ? (
            <p className="mt-1 truncate text-sm font-bold text-[#5B6B75]">{email}</p>
          ) : (
            <p className="mt-1 text-sm font-bold text-[#8A9199]">
              {mode === 'organizer' ? '主催者モード' : '参加者モード'}
            </p>
          )}
        </div>
        <Link
          href="/settings"
          className="shrink-0 text-sm font-extrabold text-[#12B8D0]"
        >
          設定
        </Link>
      </section>

      {mode === 'organizer' ? (
        <section className="card-shadow mt-4 divide-y divide-[#E4EBEE] overflow-hidden">
          <Link
            href="/settings"
            className="flex items-center justify-between px-5 py-4 text-sm font-extrabold"
          >
            <span>売上・振込設定</span>
            <span className="text-[#8A9199]">›</span>
          </Link>
          <p className="px-5 py-4 text-xs font-bold leading-5 text-[#8A9199]">
            イベント作成・下書き・詳細な主催者プロフィール編集はアプリから行えます。Web
            では主催イベントの確認ができます。
          </p>
        </section>
      ) : null}

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
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-extrabold ${
                active
                  ? 'bg-[#12202A] text-white'
                  : 'bg-white/80 text-[#5B6B75] shadow-sm'
              }`}
            >
              {item.label}
              <span className="ml-1.5 opacity-70">{item.count}</span>
            </button>
          );
        })}
      </div>

      {listError ? (
        <p className="mt-4 text-sm font-bold text-[#EF4444]">{listError}</p>
      ) : null}

      {loadingLists ? (
        <p className="mt-6 text-sm font-bold text-[#8A9199]">一覧を読み込み中…</p>
      ) : (
        <MyEventList
          events={listEvents}
          emptyTitle={emptyCopy.title}
          emptyBody={emptyCopy.body}
        />
      )}
    </main>
  );
}
