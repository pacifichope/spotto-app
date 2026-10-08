'use client';

import { X } from 'lucide-react';
import { useEffect, useId } from 'react';

import { SafetyActionsMenu } from '@/components/SafetyActionsMenu';
import { useHiddenUserIds } from '@/hooks/useHiddenUserIds';
import { useAuth } from '@/lib/auth-context';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import { useT } from '@/lib/i18n/locale-context';

export type ProfilePerson = {
  id: string;
  name: string;
  imageUri?: string;
  bio?: string;
  gender?: '男性' | '女性';
  self?: boolean;
  isHost?: boolean;
};

type Props = {
  open: boolean;
  person: ProfilePerson | null;
  onClose: () => void;
  /** ブロック後に追加で行う処理（一覧から外すなど） */
  onBlocked?: (userId: string) => void;
};

function Avatar({
  person,
  size = 96,
}: {
  person: Pick<ProfilePerson, 'name' | 'imageUri' | 'gender'>;
  size?: number;
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
        className={`rounded-full object-cover ring-2 ${ring}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`brand-gradient grid place-items-center rounded-full text-2xl font-extrabold ring-2 ${ring}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initial}
    </span>
  );
}

export function UserProfileModal({ open, person, onClose, onBlocked }: Props) {
  const t = useT();
  const { user } = useAuth();
  const { blockedIds, markBlocked, markUnblocked } = useHiddenUserIds();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || !person) return null;

  const isSelf = Boolean(person.self || (user && person.id === user.uid));

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute inset-0 bg-[#0B1A22]/45 backdrop-blur-md"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(88dvh,560px)] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_24px_64px_rgba(11,26,34,0.28)]"
      >
        <div className="flex items-center justify-between border-b border-[#E4EBEE] px-4 py-3.5">
          <span className="inline-block w-8" aria-hidden />
          <h2 id={titleId} className="text-sm font-extrabold">
            {t('profile.title')}
          </h2>
          <div className="flex items-center gap-1.5">
            {user && !isSelf ? (
              <SafetyActionsMenu
                target={{
                  id: person.id,
                  name: person.name,
                  imageUri: person.imageUri,
                }}
                currentUserId={user.uid}
                getIdToken={async () => idTokenWithAuthenticatedRole(user)}
                isBlocked={blockedIds.has(person.id)}
                onBlockedChange={(blocked) => {
                  if (blocked) {
                    markBlocked(person.id);
                    onBlocked?.(person.id);
                  } else {
                    markUnblocked(person.id);
                  }
                }}
                onBlocked={() => {
                  onClose();
                }}
              />
            ) : (
              <span className="inline-block w-8" aria-hidden />
            )}
            <button
              type="button"
              aria-label={t('common.close')}
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-full bg-[#F4F7F8] text-[#5B6B75]"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-8">
          <div className="flex flex-col items-center text-center">
            <Avatar person={person} size={96} />
            <p className="mt-4 text-xl font-extrabold tracking-tight">
              {person.name}
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              {person.isHost ? (
                <span className="rounded-full bg-[#E5F9FC] px-2.5 py-1 text-[11px] font-extrabold text-[#12B8D0]">
                  {t('common.host')}
                </span>
              ) : null}
              {person.gender ? (
                <span className="rounded-full bg-[#F4F7F8] px-2.5 py-1 text-[11px] font-extrabold text-[#5B6B75]">
                  {person.gender === '男性'
                    ? t('common.male')
                    : person.gender === '女性'
                      ? t('common.female')
                      : person.gender}
                </span>
              ) : null}
              {isSelf ? (
                <span className="rounded-full bg-[#FFF4E8] px-2.5 py-1 text-[11px] font-extrabold text-[#E8742A]">
                  {t('common.me')}
                </span>
              ) : null}
            </div>
            {person.bio ? (
              <p className="mt-4 text-sm font-bold leading-6 text-[#5B6B75]">
                {person.bio}
              </p>
            ) : (
              <p className="mt-4 text-sm font-bold text-[#8A9199]">
                {t('profile.noBio')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
