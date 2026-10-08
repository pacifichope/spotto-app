'use client';

import Link from 'next/link';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ProfileEditModal } from '@/components/ProfileEditModal';
import { useAuth } from '@/lib/auth-context';
import { deleteWebAccount } from '@/lib/account';
import { fetchBlockedUsers } from '@/lib/blocks';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import { useLocale, useT } from '@/lib/i18n/locale-context';
import { LEGAL_EXTERNAL_URLS } from '@/lib/legal';
import { mypageHref, parseMyPageMode } from '@/lib/mypageNav';
import {
  fetchWebProfile,
  profileFromFirebaseUser,
  type WebUserProfile,
} from '@/lib/profile';

type Row = {
  key: string;
  label: string;
  caption?: string;
  href?: string;
  external?: boolean;
  danger?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

export function SettingsScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, ready, busy, signOut } = useAuth();
  const t = useT();
  const { locale } = useLocale();
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<WebUserProfile>(() =>
    profileFromFirebaseUser(null),
  );
  const [blockedCount, setBlockedCount] = useState(0);

  const fromMode = searchParams.get('from') || searchParams.get('mode') || '';
  const mypageBackHref = mypageHref({
    mode: parseMyPageMode(new URLSearchParams(`mode=${fromMode}`)),
  });
  const withFrom = (path: string) =>
    fromMode ? `${path}?from=${encodeURIComponent(fromMode)}` : path;

  useEffect(() => {
    if (!user) {
      setProfile(profileFromFirebaseUser(null));
      setBlockedCount(0);
      return;
    }
    let cancelled = false;
    setProfile(profileFromFirebaseUser(user));
    void fetchWebProfile({
      userId: user.uid,
      fallback: profileFromFirebaseUser(user),
    }).then((next) => {
      if (!cancelled) setProfile(next);
    });
    void fetchBlockedUsers({
      userId: user.uid,
      getIdToken: async () => idTokenWithAuthenticatedRole(user),
    })
      .then((list) => {
        if (!cancelled) setBlockedCount(list.length);
      })
      .catch(() => {
        if (!cancelled) setBlockedCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function confirmLogout() {
    setMessage('');
    try {
      await signOut();
      setLogoutOpen(false);
      router.replace('/');
    } catch {
      setLogoutOpen(false);
    }
  }

  async function confirmDelete() {
    if (!user || deleting) return;
    setDeleting(true);
    setMessage('');
    try {
      const result = await deleteWebAccount({
        getIdToken: async () => idTokenWithAuthenticatedRole(user),
      });
      if (!result.ok) {
        setMessage(result.error);
        setDeleteOpen(false);
        return;
      }
      await signOut();
      setDeleteOpen(false);
      router.replace('/');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('settings.deleteFailed'));
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  const languageCaption =
    locale === 'en'
      ? t('settings.languageEnglish')
      : t('settings.languageJapanese');

  const blocklistCaption = user
    ? blockedCount > 0
      ? t('settings.blocklistCaptionCount', { count: blockedCount })
      : t('settings.blocklistCaptionEmpty')
    : t('settings.blocklistCaptionEmpty');

  const rows: Row[] = useMemo(
    () => [
      {
        key: 'profile',
        label: t('settings.profile'),
        onClick: () => {
          if (!user) {
            router.push(mypageBackHref);
            return;
          }
          setProfileOpen(true);
        },
      },
      {
        key: 'language',
        label: t('settings.language'),
        caption: languageCaption,
        href: withFrom('/settings/language'),
      },
      {
        key: 'notifications',
        label: t('settings.notifications'),
        caption: t('settings.notificationsCaption'),
        href: withFrom('/settings/notifications'),
      },
      {
        key: 'blocklist',
        label: t('settings.blocklist'),
        caption: blocklistCaption,
        href: withFrom('/settings/blocklist'),
      },
      {
        key: 'contact',
        label: t('settings.contact'),
        caption: t('settings.contactCaption'),
        href: '/settings/contact',
      },
      {
        key: 'terms',
        label: t('settings.terms'),
        caption: t('settings.termsCaption'),
        href: LEGAL_EXTERNAL_URLS.terms,
        external: true,
      },
      {
        key: 'privacy',
        label: t('settings.privacy'),
        caption: t('settings.privacyCaption'),
        href: LEGAL_EXTERNAL_URLS.privacy,
        external: true,
      },
      {
        key: 'tokushoho',
        label: t('settings.tokushoho'),
        caption: t('settings.tokushohoCaption'),
        href: LEGAL_EXTERNAL_URLS.tokushoho,
        external: true,
      },
      {
        key: 'delete',
        label: deleting ? t('settings.deleting') : t('settings.deleteAccount'),
        caption: user
          ? t('settings.deleteAccountCaptionLoggedIn')
          : t('settings.deleteAccountCaptionGuest'),
        danger: true,
        busy: deleting,
        disabled: deleting || !user,
        onClick: () => {
          if (!user || deleting) return;
          setMessage('');
          setDeleteOpen(true);
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- withFrom/fromMode captured via closure
    [
      t,
      user,
      languageCaption,
      blocklistCaption,
      deleting,
      fromMode,
      mypageBackHref,
      router,
    ],
  );

  if (!ready) {
    return (
      <main className="page-main pt-4 md:pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">
          {t('settings.title')}
        </h1>
        <p className="mt-4 text-sm font-bold text-[#8A9199]">{t('common.loading')}</p>
      </main>
    );
  }

  return (
    <main className="page-main pt-4 md:pt-2">
      <div className="flex items-center gap-3">
        <Link
          href={mypageBackHref}
          className="text-sm font-extrabold text-[#12B8D0]"
        >
          {t('settings.backMypage')}
        </Link>
      </div>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">
        {t('settings.title')}
      </h1>

      <section className="card-shadow mt-4 overflow-hidden">
        {rows.map((row, index) => {
          const className = `flex w-full items-center gap-3 px-5 py-4 text-left ${
            index > 0 ? 'border-t border-[#E4EBEE]' : ''
          } ${row.disabled ? 'opacity-55' : ''}`;
          const body = (
            <>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm font-extrabold ${
                    row.danger ? 'text-[#A35D5D]' : ''
                  }`}
                >
                  {row.label}
                </span>
                {row.caption ? (
                  <span
                    className={`mt-0.5 block truncate text-xs font-bold ${
                      row.danger ? 'text-[#9A7A7A]' : 'text-[#8A9199]'
                    }`}
                  >
                    {row.caption}
                  </span>
                ) : null}
              </span>
              {row.busy ? (
                <span
                  className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#A35D5D]/30 border-t-[#A35D5D]"
                  aria-hidden
                />
              ) : row.external ? (
                <ExternalLink size={16} className="shrink-0 text-[#8A9199]" />
              ) : (
                <ChevronRight
                  size={18}
                  className={`shrink-0 ${
                    row.danger ? 'text-[#9A7A7A]' : 'text-[#8A9199]'
                  }`}
                />
              )}
            </>
          );

          if (row.href && row.external) {
            return (
              <a
                key={row.key}
                href={row.href}
                target="_blank"
                rel="noreferrer"
                className={className}
              >
                {body}
              </a>
            );
          }
          if (row.href) {
            return (
              <Link key={row.key} href={row.href} className={className}>
                {body}
              </Link>
            );
          }
          return (
            <button
              key={row.key}
              type="button"
              disabled={row.disabled}
              onClick={row.onClick}
              className={`${className} disabled:cursor-not-allowed`}
            >
              {body}
            </button>
          );
        })}
      </section>

      {message ? (
        <p className="mt-3 text-sm font-bold text-[#EF4444]">{message}</p>
      ) : null}

      <div className="mt-7 flex justify-center">
        {user ? (
          <button
            type="button"
            disabled={busy || deleting}
            onClick={() => {
              setMessage('');
              setLogoutOpen(true);
            }}
            className="px-3 py-2 text-base font-extrabold text-[#EF4444] disabled:opacity-60"
          >
            {busy ? t('common.processing') : t('settings.logout')}
          </button>
        ) : (
          <Link
            href={mypageBackHref}
            className="px-3 py-2 text-base font-extrabold text-[#12B8D0]"
          >
            {t('settings.login')}
          </Link>
        )}
      </div>

      <ConfirmDialog
        open={logoutOpen}
        title={t('settings.logoutTitle')}
        description={t('settings.logoutBody')}
        confirmLabel={t('settings.logoutConfirm')}
        busy={busy}
        onCancel={() => {
          if (!busy) setLogoutOpen(false);
        }}
        onConfirm={() => void confirmLogout()}
      />

      <ConfirmDialog
        open={deleteOpen}
        title={t('settings.deleteTitle')}
        description={
          <>
            <p>
              {t('settings.deleteBodyBefore')}
              <span className="font-extrabold text-[#EF4444]">
                {t('settings.deleteBodyStrong')}
              </span>
              {t('settings.deleteBodyAfter')}
            </p>
            <p className="mt-2">{t('settings.deleteBodyAsk')}</p>
          </>
        }
        confirmLabel={t('settings.deleteConfirm')}
        tone="destructive"
        busy={deleting}
        confirmPhrase={t('settings.deletePhrase')}
        onCancel={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        onConfirm={() => void confirmDelete()}
      />

      {user ? (
        <ProfileEditModal
          open={profileOpen}
          user={user}
          profile={profile}
          getIdToken={async () => idTokenWithAuthenticatedRole(user)}
          onClose={() => setProfileOpen(false)}
          onSaved={(next) => {
            setProfile(next);
            setProfileOpen(false);
          }}
        />
      ) : null}
    </main>
  );
}
