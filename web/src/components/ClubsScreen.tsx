'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';

import { LoginPromptCard } from '@/components/AuthControls';
import { useAuth } from '@/lib/auth-context';
import { clubHref, fetchJoinedClubs, type JoinedClub } from '@/lib/clubs';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import { mypageHref } from '@/lib/mypageNav';

export function ClubsScreen() {
  const { user, ready } = useAuth();
  const [clubs, setClubs] = useState<JoinedClub[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      setClubs([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    void fetchJoinedClubs({
      userId: user.uid,
      getIdToken: async () => idTokenWithAuthenticatedRole(user),
    })
      .then((next) => {
        if (!cancelled) setClubs(next);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'クラブの取得に失敗しました');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!ready) {
    return (
      <main className="page-main pt-4 md:pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">参加したクラブ</h1>
        <p className="mt-4 text-sm font-bold text-[#8A9199]">読み込み中…</p>
      </main>
    );
  }

  return (
    <main className="page-main pt-4 md:pt-2">
      <Link
        href={mypageHref({ mode: 'participant' })}
        className="text-sm font-extrabold text-[#12B8D0]"
      >
        ← マイページ
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">参加したクラブ</h1>
      <p className="mt-1 text-sm font-bold text-[#5B6B75]">
        参加したイベントの主催者サークルが一覧になります。
      </p>

      {!user ? (
        <LoginPromptCard title="ログインしてクラブを確認" />
      ) : loading ? (
        <p className="mt-6 text-sm font-bold text-[#8A9199]">読み込み中…</p>
      ) : error ? (
        <p className="mt-6 text-sm font-bold text-[#EF4444]">{error}</p>
      ) : clubs.length === 0 ? (
        <section className="card-shadow mt-5 px-5 py-10 text-center">
          <p className="text-base font-extrabold">まだ参加クラブはありません</p>
          <p className="mt-2 text-sm font-bold text-[#5B6B75]">
            イベントに参加すると、主催サークルがここに表示されます。
          </p>
          <Link
            href="/"
            className="brand-gradient mt-5 inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-extrabold"
          >
            イベントを探す
          </Link>
        </section>
      ) : (
        <ul className="mt-5 space-y-2">
          {clubs.map((club) => (
            <li key={club.id}>
              <Link
                href={clubHref(club.id)}
                className="group card-shadow flex items-center gap-3 px-5 py-4 transition duration-200 hover:-translate-y-0.5 hover:bg-[#F7FBFC] hover:shadow-[0_12px_28px_rgba(18,32,42,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12B8D0]/50"
              >
                {club.imageUri ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={club.imageUri}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="brand-gradient grid h-12 w-12 shrink-0 place-items-center rounded-full text-base font-extrabold">
                    {club.name.slice(0, 1)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold">{club.name}</p>
                  <p className="mt-0.5 truncate text-xs font-bold text-[#8A9199]">
                    {[club.sport, club.bio].filter(Boolean).join(' · ') || 'サークル'}
                  </p>
                </div>
                <ChevronRight
                  size={18}
                  className="shrink-0 text-[#8A9199] transition-colors group-hover:text-[#12B8D0]"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
