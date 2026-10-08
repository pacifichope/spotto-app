'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import { LoginPromptCard } from '@/components/AuthControls';
import { BackButton } from '@/components/BackButton';
import { SettingsSkeleton } from '@/components/skeletons';
import { useT } from '@/lib/i18n/locale-context';
import { useAuth } from '@/lib/auth-context';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_PREF_ROWS,
  browserPermissionMessageKey,
  ensureBrowserNotificationPermission,
  getBrowserNotificationPermission,
  loadNotificationSettings,
  saveNotificationSettings,
  type BrowserNotificationPermission,
  type NotificationPreferenceKey,
  type NotificationSettings,
} from '@/lib/notificationSettings';

function ToggleSwitch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-[#12B8D0]' : 'bg-[#CBD5E1]'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function NotificationSettingsBody() {
  const t = useT();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || searchParams.get('mode') || '';
  const settingsBackHref = from
    ? `/settings?from=${encodeURIComponent(from)}`
    : '/settings';
  const { user, ready: authReady } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  );
  const [ready, setReady] = useState(false);
  const [pendingKey, setPendingKey] = useState<NotificationPreferenceKey | null>(
    null,
  );
  const [permission, setPermission] = useState<BrowserNotificationPermission>(
    'unsupported',
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refreshPermission = useCallback(() => {
    setPermission(getBrowserNotificationPermission());
  }, []);

  useEffect(() => {
    refreshPermission();
  }, [refreshPermission]);

  useEffect(() => {
    if (!user) {
      setSettings(DEFAULT_NOTIFICATION_SETTINGS);
      setReady(false);
      return;
    }
    let cancelled = false;
    setReady(false);
    void loadNotificationSettings({
      userId: user.uid,
      getIdToken: async () => idTokenWithAuthenticatedRole(user),
    }).then((loaded) => {
      if (cancelled) return;
      setSettings(loaded);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const apply = async (next: NotificationSettings) => {
    if (!user) return;
    setSettings(next);
    setError('');
    setMessage('');
    const result = await saveNotificationSettings({
      userId: user.uid,
      getIdToken: async () => idTokenWithAuthenticatedRole(user),
      settings: next,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(t('notifications.saved'));
    window.setTimeout(() => setMessage(''), 1600);
  };

  const handleToggle = async (
    key: NotificationPreferenceKey,
    enabled: boolean,
  ) => {
    if (!ready || pendingKey || !user) return;

    if (!enabled) {
      await apply({ ...settings, [key]: false });
      return;
    }

    setPendingKey(key);
    setError('');
    const result = await ensureBrowserNotificationPermission();
    refreshPermission();
    if (result.ok) {
      await apply({ ...settings, [key]: true });
    } else if (result.reason === 'denied') {
      setError(
        t('notifications.permDenied'),
      );
    } else {
      setError(
        t('notifications.permUnsupported'),
      );
      // 未対応でも設定自体は保存（アプリと共有）
      await apply({ ...settings, [key]: true });
    }
    setPendingKey(null);
  };

  if (!authReady) {
    return (
      <main className="page-main pt-4 md:pt-2">
        <BackButton
          fallbackHref={settingsBackHref}
          label={t('notifications.backSettings')}
        />
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{t('notifications.title')}</h1>
        <SettingsSkeleton rows={5} />
      </main>
    );
  }

  return (
    <main className="page-main pt-4 md:pt-2">
      <BackButton
        fallbackHref={settingsBackHref}
        label={t('notifications.backSettings')}
      />
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{t('notifications.title')}</h1>
      <p className="mt-1 text-sm font-bold text-[#5B6B75]">
        {t('notifications.subtitle')}
      </p>

      {!user ? (
        <LoginPromptCard title={t('notifications.loginTitle')} />
      ) : (
        <>
          <p className="mt-4 text-xs font-bold text-[#8A9199]">
            {t(browserPermissionMessageKey(permission))}
          </p>

          <section className="card-shadow mt-3 overflow-hidden">
            {NOTIFICATION_PREF_ROWS.map((row, index) => (
              <div
                key={row.key}
                className={`flex items-center gap-3 px-5 py-4 ${
                  index > 0 ? 'border-t border-[#E4EBEE]' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold">{t(row.labelKey)}</p>
                  <p className="mt-0.5 text-xs font-bold text-[#8A9199]">
                    {t(row.captionKey)}
                  </p>
                </div>
                <ToggleSwitch
                  checked={settings[row.key]}
                  disabled={!ready || pendingKey !== null}
                  label={t(row.labelKey)}
                  onChange={(next) => void handleToggle(row.key, next)}
                />
              </div>
            ))}
          </section>

          <p className="mt-3 text-xs font-bold leading-5 text-[#8A9199]">
            {t('notifications.footer')}
          </p>

          {message ? (
            <p className="mt-3 text-sm font-bold text-[#12B8D0]">{message}</p>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm font-bold text-[#EF4444]">{error}</p>
          ) : null}
        </>
      )}
    </main>
  );
}

export function NotificationSettingsScreen() {
  const t = useT();
  return (
    <Suspense
      fallback={
        <main className="page-main pt-4 md:pt-2">
          <BackButton
            fallbackHref="/settings"
            label={t('notifications.backSettings')}
          />
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{t('notifications.title')}</h1>
          <SettingsSkeleton rows={5} />
        </main>
      }
    >
      <NotificationSettingsBody />
    </Suspense>
  );
}
