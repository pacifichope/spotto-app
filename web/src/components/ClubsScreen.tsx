'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';

import { LoginPromptCard } from '@/components/AuthControls';
import { useAuth } from '@/lib/auth-context';
import { clubHref, fetchJoinedClubs, type JoinedClub } from '@/lib/clubs';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import { useT } from '@/lib/i18n/locale-context';
import { mypageHref } from '@/lib/mypageNav';

const SKELETON_COUNT = 4;

function ClubCardSkeleton() {
  return (
    <li className="card-shadow flex items-center gap-3 px-5 py-4" aria-hidden>
      <span className="skeleton-bone h-12 w-12 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <span className="skeleton-bone block h-3.5 w-[38%] max-w-[9rem] rounded-full" />
        <span className="skeleton-bone block h-3 w-[72%] max-w-[14rem] rounded-full" />
      </div>
      <span className="skeleton-bone h-4 w-4 shrink-0 rounded" />
    </li>
  );
}

function ClubListSkeleton() {
  return (
    <ul className="mt-5 space-y-2" aria-busy="true">
      {Array.from({ length: SKELETON_COUNT }, (_, index) => (
        <ClubCardSkeleton key={index} />
      ))}
    </ul>
  );
}

export function ClubsScreen() {
  const { user, ready } = useAuth();
  const t = useT();
  const [clubs, setClubs] = useState<JoinedClub[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      setClubs([]);
      setLoading(false);
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
          setError(
            caught instanceof Error ? caught.message : t('clubs.fetchFailed'),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, t]);

  const showSkeleton = !ready || (Boolean(user) && loading);

  return (
    <main className="page-main pt-4 md:pt-2">
      <Link
        href={mypageHref({ mode: 'participant' })}
        className="text-sm font-extrabold text-[#12B8D0]"
      >
        {t('clubs.backMypage')}
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">
        {t('clubs.title')}
      </h1>
      <p className="mt-1 text-sm font-bold text-[#5B6B75]">{t('clubs.subtitle')}</p>

      {showSkeleton ? (
        <ClubListSkeleton />
      ) : !user ? (
        <div className="content-fade-in mt-5">
          <LoginPromptCard title={t('clubs.loginTitle')} />
        </div>
      ) : error ? (
        <p className="content-fade-in mt-6 text-sm font-bold text-[#EF4444]">
          {error}
        </p>
      ) : clubs.length === 0 ? (
        <section className="card-shadow content-fade-in mt-5 px-5 py-10 text-center">
          <p className="text-base font-extrabold">{t('clubs.emptyTitle')}</p>
          <p className="mt-2 text-sm font-bold text-[#5B6B75]">
            {t('clubs.emptyBody')}
          </p>
          <Link
            href="/"
            className="brand-gradient mt-5 inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-extrabold"
          >
            {t('clubs.findEvents')}
          </Link>
        </section>
      ) : (
        <ul className="content-fade-in mt-5 space-y-2">
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
                    {[club.sport, club.bio].filter(Boolean).join(' · ') ||
                      t('clubs.fallback')}
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
