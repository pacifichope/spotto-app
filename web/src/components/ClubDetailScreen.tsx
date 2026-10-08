'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { LoginPromptCard } from '@/components/AuthControls';
import { BackButton } from '@/components/BackButton';
import { ClubDetailSkeleton } from '@/components/skeletons';
import { SnsBrandIcon } from '@/components/SnsBrandIcon';
import { sportCover } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import {
  fetchClubDetail,
  joinClubLocal,
  leaveClubLocal,
  readJoinedClubIds,
  type ClubDetail,
  type ClubMember,
} from '@/lib/clubs';
import { absoluteImageUrl, formatWhen } from '@/lib/eventSeo';
import { sportLabel } from '@/lib/i18n/labels';
import { useLocale, useT } from '@/lib/i18n/locale-context';
import { snsKindMeta } from '@/lib/snsLinks';
import {
  getEventStatus,
  isEventPast,
  type PublicEvent,
} from '@/lib/types';

type ActivityFilter = 'all' | 'upcoming' | 'past' | `date:${string}`;

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function MemberAvatar({ member, size = 44 }: { member: ClubMember; size?: number }) {
  const initial = member.name.trim().slice(0, 1) || '?';
  if (member.imageUri) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={member.imageUri}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="brand-gradient grid place-items-center rounded-full text-sm font-extrabold text-white"
      style={{ width: size, height: size }}
    >
      {initial}
    </span>
  );
}

function ActivityRow({ event }: { event: PublicEvent }) {
  const t = useT();
  const status = getEventStatus(event);
  const ended = status === 'ended';
  const image = absoluteImageUrl(event.imageUri) || sportCover(event.sport);
  const when =
    formatWhen(event.eventDate, event.eventTime, t) || t('event.whenUnknown');
  const sport = sportLabel(event.sport, t) || t('sport.generic');
  const title = event.title.trim() || t('event.untitled');
  const statusLabel =
    status === 'ended'
      ? t('clubs.statusEnded')
      : status === 'full'
        ? t('clubs.statusFull')
        : t('clubs.statusOpen');

  return (
    <Link
      href={`/event/${event.id}`}
      className={`card-shadow flex gap-3 overflow-hidden p-3 transition hover:opacity-95 ${
        ended ? 'opacity-70' : ''
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt=""
        className={`h-[72px] w-[72px] shrink-0 rounded-2xl object-cover ${
          ended ? 'grayscale-[0.35]' : ''
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white ${
              ended ? 'bg-[#94A3B8]' : status === 'full' ? 'bg-[#8A9199]' : 'brand-gradient'
            }`}
          >
            {statusLabel}
          </span>
          <span className="text-[11px] font-bold text-[#5B6B75]">{when}</span>
        </div>
        <h3 className="mt-1 line-clamp-2 text-sm font-extrabold tracking-tight leading-5">
          {title}
        </h3>
        <p className="mt-1 truncate text-xs font-semibold text-[#5B6B75]">
          {t('clubs.activityMeta', { sport, count: event.joinedCount })}
        </p>
      </div>
    </Link>
  );
}

export function ClubDetailScreen({ clubId }: { clubId: string }) {
  const t = useT();
  const { locale } = useLocale();
  const { user, ready } = useAuth();
  const [club, setClub] = useState<ClubDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ActivityFilter>('upcoming');
  const [joined, setJoined] = useState(false);
  const [loginHint, setLoginHint] = useState(false);

  const weekdays = locale === 'en' ? WEEKDAYS_EN : WEEKDAYS_JA;

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
        if (!next) {
          setClub(null);
          setError(t('clubs.notFound'));
          return;
        }
        const uid = user?.uid?.trim() || '';
        const members = next.members.map((member) => ({
          ...member,
          self: Boolean(uid && member.id === uid),
        }));
        setClub({ ...next, members });
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
  }, [clubId, t, user?.uid]);

  useEffect(() => {
    const uid = user?.uid?.trim() || '';
    const id = clubId.trim();
    if (!uid || !id) {
      setJoined(false);
      return;
    }
    setJoined(readJoinedClubIds(uid).has(id));
  }, [user?.uid, clubId]);

  const isOwnClub = Boolean(user?.uid && club && user.uid === club.id);

  const upcomingCount = useMemo(() => {
    if (!club) return 0;
    return club.events.filter((event) => !isEventPast(event)).length;
  }, [club]);

  const activityDates = useMemo(() => {
    if (!club) return [] as string[];
    const stamps = new Set<string>();
    for (const event of club.events) {
      const stamp = event.eventDate.trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(stamp)) stamps.add(stamp);
    }
    return [...stamps].sort();
  }, [club]);

  const visibleEvents = useMemo(() => {
    if (!club) return [];
    return club.events.filter((event) => {
      if (filter === 'all') return true;
      if (filter === 'upcoming') return !isEventPast(event);
      if (filter === 'past') return isEventPast(event);
      if (filter.startsWith('date:')) {
        return event.eventDate.startsWith(filter.slice(5));
      }
      return true;
    });
  }, [club, filter]);

  const dateChipLabel = useCallback(
    (stamp: string) => {
      const match = stamp.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return stamp;
      const month = Number(match[2]);
      const day = Number(match[3]);
      const parsed = new Date(`${stamp}T12:00:00`);
      const weekday = weekdays[parsed.getDay()] ?? '';
      return t('clubs.dateChip', { month, day, weekday });
    },
    [t, weekdays],
  );

  const handleJoin = () => {
    if (!club || isOwnClub) return;
    const uid = user?.uid?.trim();
    if (!uid) {
      setLoginHint(true);
      return;
    }
    if (joined) {
      const ok = window.confirm(
        t('clubs.leaveConfirm', { name: club.name }),
      );
      if (!ok) return;
      leaveClubLocal(uid, club.id);
      setJoined(false);
      return;
    }
    joinClubLocal(uid, club.id);
    setJoined(true);
    setLoginHint(false);
  };

  const filterOptions = useMemo(() => {
    const base: { key: ActivityFilter; label: string }[] = [
      { key: 'all', label: t('clubs.filterAll') },
      {
        key: 'upcoming',
        label: t('clubs.filterUpcoming', { count: upcomingCount }),
      },
      { key: 'past', label: t('clubs.filterPast') },
      ...activityDates.map((date) => ({
        key: `date:${date}` as ActivityFilter,
        label: dateChipLabel(date),
      })),
    ];
    return base;
  }, [activityDates, dateChipLabel, t, upcomingCount]);

  return (
    <main className="page-main relative pb-28 pt-0 md:pb-32 md:pt-0">
      {loading || !ready ? (
        <div className="relative">
          <BackButton
            variant="overlay"
            fallbackHref="/clubs"
            aria-label={t('clubs.backList')}
          />
          <ClubDetailSkeleton />
        </div>
      ) : error || !club ? (
        <div className="pt-4 md:pt-2">
          <BackButton fallbackHref="/clubs" label={t('clubs.backList')} />
          <section className="card-shadow mt-5 px-5 py-10 text-center">
            <p className="text-base font-extrabold">{error || t('clubs.notFound')}</p>
            <Link
              href="/clubs"
              className="brand-gradient mt-5 inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-extrabold"
            >
              {t('clubs.backToList')}
            </Link>
          </section>
        </div>
      ) : (
        <div className="content-fade-in">
          {/* Cover + overlapping avatar */}
          <section className="relative">
            <div className="relative h-44 overflow-hidden sm:h-56 md:h-64 md:rounded-b-3xl">
              {club.coverUri ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={club.coverUri}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="brand-gradient h-full w-full" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/5 to-transparent" />
              <BackButton
                variant="overlay"
                fallbackHref="/clubs"
                aria-label={t('clubs.backList')}
              />
            </div>

            <div className="relative z-10 -mt-10 flex justify-center px-4 sm:-mt-12">
              {club.imageUri ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={club.imageUri}
                  alt=""
                  className="h-[72px] w-[72px] rounded-full border-4 border-white object-cover shadow-md sm:h-20 sm:w-20"
                />
              ) : (
                <span className="brand-gradient grid h-[72px] w-[72px] place-items-center rounded-full border-4 border-white text-2xl font-extrabold text-white shadow-md sm:h-20 sm:w-20">
                  {club.name.slice(0, 1)}
                </span>
              )}
            </div>
          </section>

          {/* Identity + SNS */}
          <section className="mt-3 px-1 text-center sm:mt-4">
            <h1 className="text-2xl font-extrabold tracking-tight">{club.name}</h1>
            <p className="mt-1 text-sm font-bold text-[#5B6B75]">
              {t('clubs.hostLine', { name: club.hostName })}
            </p>
            <p className="mt-1 text-xs font-extrabold text-[#12B8D0]">
              {t('clubs.statsLine', {
                events: club.events.length,
                members: club.members.length,
              })}
              {club.sport ? ` · ${sportLabel(club.sport, t) || club.sport}` : ''}
            </p>
            {club.bio ? (
              <p className="mx-auto mt-3 max-w-2xl text-sm font-bold leading-6 text-[#5B6B75]">
                {club.bio}
              </p>
            ) : (
              <p className="mt-3 text-sm font-bold text-[#8A9199]">{t('clubs.noBio')}</p>
            )}

            {club.snsLinks.length > 0 ? (
              <div className="mt-5">
                <p className="text-xs font-extrabold text-[#8A9199]">
                  {t('clubs.snsTitle')}
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-3">
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
              </div>
            ) : null}
          </section>

          {/* Members */}
          <section className="card-shadow mt-6 px-4 py-4">
            <h2 className="text-sm font-extrabold tracking-tight">
              {t('clubs.membersTitle', { count: club.members.length })}
            </h2>
            <div className="mt-3 flex gap-4 overflow-x-auto pb-1">
              {club.members.map((member) => (
                <div
                  key={member.id}
                  className="flex w-16 shrink-0 flex-col items-center gap-1.5"
                >
                  <div className="relative">
                    <MemberAvatar member={member} size={44} />
                    {member.role === 'host' ? (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#12B8D0] px-1.5 py-px text-[9px] font-extrabold text-white">
                        {t('clubs.hostTag')}
                      </span>
                    ) : member.self ? (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#FF9533] px-1.5 py-px text-[9px] font-extrabold text-white">
                        {t('clubs.selfTag')}
                      </span>
                    ) : null}
                  </div>
                  <span className="w-full truncate text-center text-[11px] font-bold text-[#5B6B75]">
                    {member.name}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Activities */}
          <section className="mt-7">
            <div className="px-1">
              <h2 className="text-lg font-extrabold tracking-tight">
                {t('clubs.activitiesTitle')}
              </h2>
              <p className="mt-0.5 text-xs font-bold text-[#8A9199]">
                {t('clubs.activitiesHint')}
              </p>
            </div>

            <div
              className="mt-3 flex gap-2 overflow-x-auto pb-1"
              role="tablist"
              aria-label={t('clubs.activitiesTitle')}
            >
              {filterOptions.map((option) => {
                const active = filter === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(option.key)}
                    className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-extrabold transition ${
                      active
                        ? 'brand-gradient'
                        : 'bg-white text-[#5B6B75] ring-1 ring-[#E4EBEE]'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 space-y-3">
              {visibleEvents.length === 0 ? (
                <p className="card-shadow px-4 py-8 text-center text-sm font-bold text-[#5B6B75]">
                  {t('clubs.activitiesEmpty')}
                </p>
              ) : (
                visibleEvents.map((event) => (
                  <ActivityRow key={event.id} event={event} />
                ))
              )}
            </div>
          </section>

          {loginHint && !user ? (
            <div className="mt-6">
              <LoginPromptCard title={t('clubs.loginToJoin')} />
            </div>
          ) : null}
        </div>
      )}

      {/* Fixed join button */}
      {club && !loading ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E4EBEE] bg-white/95 px-4 py-3 backdrop-blur-md supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto w-full max-w-3xl">
            {isOwnClub ? (
              <p className="rounded-2xl bg-[#F4F7F8] px-4 py-3.5 text-center text-sm font-extrabold text-[#5B6B75]">
                {t('clubs.ownClub')}
              </p>
            ) : (
              <button
                type="button"
                onClick={handleJoin}
                aria-label={joined ? t('clubs.joinedLabel') : t('clubs.joinLabel')}
                className={`flex h-14 w-full items-center justify-center rounded-full text-base font-extrabold transition ${
                  joined
                    ? 'bg-white text-[#12B8D0] ring-2 ring-[#29D1E8]'
                    : 'brand-gradient'
                }`}
              >
                {joined ? t('clubs.joined') : t('clubs.join')}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
