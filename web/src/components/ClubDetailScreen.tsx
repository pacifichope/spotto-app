'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { EventCard } from '@/components/EventCard';
import { SnsBrandIcon } from '@/components/SnsBrandIcon';
import { fetchClubDetail, type ClubDetail } from '@/lib/clubs';
import { useT } from '@/lib/i18n/locale-context';
import { snsKindMeta } from '@/lib/snsLinks';

export function ClubDetailScreen({ clubId }: { clubId: string }) {
  const t = useT();
  const [club, setClub] = useState<ClubDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = clubId.trim();
    if (!id) {
      setClub(null);
      setLoading(false);
      setError(t('clubs.notFound'));
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    void fetchClubDetail(id)
      .then((next) => {
        if (cancelled) return;
        setClub(next);
        if (!next) setError(t('clubs.notFound'));
      })
      .catch((caught) => {
        if (cancelled) return;
        setClub(null);
        setError(
          caught instanceof Error ? caught.message : t('clubs.fetchFailed'),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId, t]);

  return (
    <main className="page-main pt-4 md:pt-2">
      <Link href="/clubs" className="text-sm font-extrabold text-[#12B8D0]">
        {t('clubs.backList')}
      </Link>

      {loading ? (
        <p className="mt-6 text-sm font-bold text-[#8A9199]">{t('clubs.loading')}</p>
      ) : error || !club ? (
        <section className="card-shadow mt-5 px-5 py-10 text-center">
          <p className="text-base font-extrabold">{error || t('clubs.notFound')}</p>
          <Link
            href="/clubs"
            className="brand-gradient mt-5 inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-extrabold"
          >
            {t('clubs.backToList')}
          </Link>
        </section>
      ) : (
        <>
          <section className="card-shadow mt-4 overflow-hidden">
            {club.coverUri ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={club.coverUri}
                alt=""
                className="h-36 w-full object-cover sm:h-44"
              />
            ) : (
              <div className="brand-gradient h-28 w-full sm:h-36" />
            )}
            <div className="relative px-5 pb-5 pt-0">
              <div className="-mt-8 flex items-end gap-3 sm:-mt-10">
                {club.imageUri ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={club.imageUri}
                    alt=""
                    className="h-16 w-16 rounded-full border-4 border-white object-cover shadow-sm sm:h-20 sm:w-20"
                  />
                ) : (
                  <span className="brand-gradient grid h-16 w-16 place-items-center rounded-full border-4 border-white text-xl font-extrabold shadow-sm sm:h-20 sm:w-20 sm:text-2xl">
                    {club.name.slice(0, 1)}
                  </span>
                )}
                <div className="min-w-0 flex-1 pb-1">
                  <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">
                    {club.name}
                  </h1>
                  {club.sport ? (
                    <p className="mt-0.5 text-xs font-extrabold text-[#12B8D0]">
                      {club.sport}
                    </p>
                  ) : null}
                </div>
              </div>
              {club.bio ? (
                <p className="mt-4 text-sm font-bold leading-6 text-[#5B6B75]">
                  {club.bio}
                </p>
              ) : (
                <p className="mt-4 text-sm font-bold text-[#8A9199]">{t('clubs.noBio')}</p>
              )}
              {club.snsLinks.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-3">
                  {club.snsLinks.map((link) => {
                    const meta = snsKindMeta(link.kind);
                    const label =
                      link.kind === 'web' ? t('sns.website') : meta.label;
                    return (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-[68px] flex-col items-center gap-1.5 transition hover:opacity-80"
                        aria-label={t('clubs.openSns', { label })}
                      >
                        <SnsBrandIcon kind={link.kind} size={44} />
                        <span className="w-full truncate text-center text-[11px] font-extrabold text-[#5B6B75]">
                          {label}
                        </span>
                      </a>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </section>

          <div className="mt-6 flex items-end justify-between gap-3 px-1">
            <h2 className="text-lg font-extrabold tracking-tight">{t('clubs.events')}</h2>
            <p className="text-sm font-bold text-[#5B6B75]">
              {t('clubs.count', { count: club.events.length })}
            </p>
          </div>

          {club.events.length === 0 ? (
            <section className="card-shadow mt-3 px-5 py-8 text-center">
              <p className="text-sm font-bold text-[#5B6B75]">{t('clubs.noEvents')}</p>
            </section>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {club.events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
