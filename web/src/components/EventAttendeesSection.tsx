'use client';

import { ChevronLeft, Users, X } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';

import { SafetyActionsMenu } from '@/components/SafetyActionsMenu';
import { AttendeesSkeleton } from '@/components/skeletons';
import { useHiddenUserIds } from '@/hooks/useHiddenUserIds';
import { useAuth } from '@/lib/auth-context';
import {
  fetchEventAttendees,
  type EventAttendee,
} from '@/lib/attendees';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import { useT } from '@/lib/i18n/locale-context';

type Props = {
  eventId: string;
  hostId?: string;
  hostName?: string;
  hostImageUri?: string | null;
  capacity: number;
  joinedCountFallback: number;
};

function AvatarBubble({
  person,
  size = 36,
  className = '',
}: {
  person: Pick<EventAttendee, 'name' | 'imageUri' | 'gender'>;
  size?: number;
  className?: string;
}) {
  const initial = (person.name.trim() || '?').slice(0, 1);
  const ring =
    person.gender === '女性'
      ? 'ring-[#F9A8D4]'
      : person.gender === '男性'
        ? 'ring-[#7DD3FC]'
        : 'ring-white';

  if (person.imageUri) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={person.imageUri}
        alt=""
        width={size}
        height={size}
        className={`rounded-full object-cover ring-2 ${ring} ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`brand-gradient grid place-items-center rounded-full text-xs font-extrabold ring-2 ${ring} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initial}
    </span>
  );
}

export function EventAttendeesSection({
  eventId,
  hostId,
  hostName,
  hostImageUri,
  capacity,
  joinedCountFallback,
}: Props) {
  const t = useT();
  const { user } = useAuth();
  const { hiddenIds, blockedIds, markBlocked, markUnblocked } =
    useHiddenUserIds();
  const titleId = useId();
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const [selected, setSelected] = useState<EventAttendee | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchEventAttendees({
      eventId,
      hostId,
      hostName,
      hostImageUri,
      currentUserId: user?.uid,
      getIdToken: user
        ? async () => idTokenWithAuthenticatedRole(user)
        : undefined,
    })
      .then((next) => {
        if (!cancelled) setAttendees(next);
      })
      .catch(() => {
        if (!cancelled) setAttendees([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, hostId, hostName, hostImageUri, user]);

  useEffect(() => {
    if (!listOpen && !selected) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (selected) setSelected(null);
      else setListOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [listOpen, selected]);

  const visibleAttendees = useMemo(
    () =>
      attendees.filter(
        (person) => person.self || !hiddenIds.has(person.id),
      ),
    [attendees, hiddenIds],
  );

  useEffect(() => {
    if (selected && !selected.self && hiddenIds.has(selected.id)) {
      setSelected(null);
    }
  }, [selected, hiddenIds]);

  const preview = visibleAttendees.slice(0, 6);
  const count =
    !loading && attendees.length > 0
      ? visibleAttendees.length
      : Math.max(visibleAttendees.length, joinedCountFallback);
  const capacityLabel =
    capacity > 0
      ? t('attendees.countCapacity', { count, capacity })
      : t('attendees.countOnly', { count });

  function openList() {
    setSelected(null);
    setListOpen(true);
  }

  function closeAll() {
    setListOpen(false);
    setSelected(null);
  }

  return (
    <>
      <section className="card-shadow mt-4 p-4" aria-label={t('attendees.title')}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold">{t('attendees.title')}</h2>
          {count > 0 ? (
            <button
              type="button"
              onClick={openList}
              className="text-xs font-extrabold text-[#12B8D0] hover:underline"
            >
              {t('attendees.viewAll')}
            </button>
          ) : null}
        </div>

        {loading ? (
          <AttendeesSkeleton />
        ) : count === 0 && visibleAttendees.length === 0 ? (
          <p className="mt-3 text-sm font-bold text-[#8A9199]">{t('attendees.empty')}</p>
        ) : (
          <button
            type="button"
            onClick={openList}
            className="mt-3 flex w-full items-center gap-3 rounded-2xl text-left transition hover:bg-[#F7FBFC]"
            aria-label={t('attendees.openListAria', { label: capacityLabel })}
          >
            <div className="flex shrink-0 pl-1">
              {preview.length > 0 ? (
                preview.map((person) => (
                  <AvatarBubble
                    key={person.id}
                    person={person}
                    size={36}
                    className="-ml-2 first:ml-0"
                  />
                ))
              ) : (
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[#E5F9FC] text-[#12B8D0]">
                  <Users size={18} />
                </span>
              )}
            </div>
            <p className="min-w-0 flex-1 text-sm font-extrabold leading-5">
              {capacityLabel}
              {hostName ? (
                <span className="font-bold text-[#5B6B75]">{t('attendees.hostBy', { name: hostName })}</span>
              ) : null}
            </p>
          </button>
        )}
      </section>

      {listOpen ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            aria-label={t('common.close')}
            className="absolute inset-0 bg-[#0B1A22]/45 backdrop-blur-md"
            onClick={closeAll}
          />
          <div
            role="dialog"
            aria-modal
            aria-labelledby={titleId}
            className="relative z-10 flex max-h-[min(88dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_24px_64px_rgba(11,26,34,0.28)]"
          >
            {selected ? (
              <>
                <div className="flex items-center justify-between border-b border-[#E4EBEE] px-4 py-3.5">
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="inline-flex items-center gap-1 text-sm font-extrabold text-[#12B8D0]"
                  >
                    <ChevronLeft size={18} />
                    {t('attendees.backToList')}
                  </button>
                  <h2 id={titleId} className="text-sm font-extrabold">
                    {t('attendees.profile')}
                  </h2>
                  <div className="flex items-center gap-1.5">
                    {user && !selected.self ? (
                      <SafetyActionsMenu
                        target={{
                          id: selected.id,
                          name: selected.name,
                          imageUri: selected.imageUri,
                        }}
                        currentUserId={user.uid}
                        getIdToken={async () =>
                          idTokenWithAuthenticatedRole(user)
                        }
                        isBlocked={blockedIds.has(selected.id)}
                        onBlockedChange={(blocked) => {
                          if (blocked) markBlocked(selected.id);
                          else markUnblocked(selected.id);
                        }}
                        onBlocked={() => {
                          setSelected(null);
                        }}
                      />
                    ) : (
                      <span className="inline-block w-8" aria-hidden />
                    )}
                    <button
                      type="button"
                      aria-label={t('common.close')}
                      onClick={closeAll}
                      className="grid h-8 w-8 place-items-center rounded-full bg-[#F4F7F8] text-[#5B6B75]"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
                <div className="overflow-y-auto px-5 py-8">
                  <div className="flex flex-col items-center text-center">
                    <AvatarBubble person={selected} size={96} />
                    <p className="mt-4 text-xl font-extrabold tracking-tight">
                      {selected.name}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                      {selected.isHost ? (
                        <span className="rounded-full bg-[#E5F9FC] px-2.5 py-1 text-[11px] font-extrabold text-[#12B8D0]">
                          {t('attendees.hostBadge')}
                        </span>
                      ) : null}
                      {selected.gender ? (
                        <span className="rounded-full bg-[#F4F7F8] px-2.5 py-1 text-[11px] font-extrabold text-[#5B6B75]">
                          {selected.gender === '男性'
                            ? t('common.male')
                            : selected.gender === '女性'
                              ? t('common.female')
                              : selected.gender}
                        </span>
                      ) : null}
                      {selected.self ? (
                        <span className="rounded-full bg-[#FFF4E8] px-2.5 py-1 text-[11px] font-extrabold text-[#E8742A]">
                          {t('attendees.you')}
                        </span>
                      ) : null}
                    </div>
                    {(selected.ticketQuantity ?? 1) > 1 ? (
                      <p className="mt-3 text-xs font-bold text-[#5B6B75]">
                        {t('attendees.ticketSlots', { count: selected.ticketQuantity ?? 1 })}
                      </p>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-[#E4EBEE] px-4 py-3.5">
                  <div>
                    <h2 id={titleId} className="text-base font-extrabold tracking-tight">
                      {t('attendees.listTitle')}
                    </h2>
                    <p className="mt-0.5 text-xs font-bold text-[#5B6B75]">
                      {capacityLabel}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={t('common.close')}
                    onClick={closeAll}
                    className="grid h-8 w-8 place-items-center rounded-full bg-[#F4F7F8] text-[#5B6B75]"
                  >
                    <X size={16} />
                  </button>
                </div>
                <ul className="overflow-y-auto">
                  {visibleAttendees.length === 0 ? (
                    <li className="px-5 py-10 text-center text-sm font-bold text-[#8A9199]">
                      {t('attendees.empty')}
                    </li>
                  ) : (
                    visibleAttendees.map((person, index) => (
                      <li key={person.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(person)}
                          className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[#F7FBFC] sm:px-5 ${
                            index > 0 ? 'border-t border-[#E4EBEE]' : ''
                          }`}
                        >
                          <AvatarBubble person={person} size={44} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-extrabold">
                                {person.name}
                              </span>
                              {person.isHost ? (
                                <span className="shrink-0 rounded-full bg-[#E5F9FC] px-2 py-0.5 text-[10px] font-extrabold text-[#12B8D0]">
                                  {t('attendees.hostShort')}
                                </span>
                              ) : null}
                              {person.self ? (
                                <span className="shrink-0 rounded-full bg-[#FFF4E8] px-2 py-0.5 text-[10px] font-extrabold text-[#E8742A]">
                                  {t('attendees.you')}
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block truncate text-xs font-bold text-[#5B6B75]">
                              {(person.gender === '男性'
                                ? t('common.male')
                                : person.gender === '女性'
                                  ? t('common.female')
                                  : person.gender) ||
                                (person.isHost
                                  ? t('attendees.eventHost')
                                  : t('attendees.participant'))}
                              {(person.ticketQuantity ?? 1) > 1
                                ? t('attendees.ticketSlotsInline', {
                                    count: person.ticketQuantity ?? 1,
                                  })
                                : ''}
                            </span>
                          </span>
                          <span className="text-[#8A9199]" aria-hidden>
                            ›
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
