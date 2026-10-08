'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import { LoginPromptCard } from '@/components/AuthControls';
import { useAuth } from '@/lib/auth-context';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_PREF_ROWS,
  browserPermissionLabel,
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
    setMessage('保存しました');
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
        'ブラウザの通知が許可されていません。アドレスバー横のサイト設定から通知を許可してください。',
      );
    } else {
      setError(
        'このブラウザでは通知 API を利用できません。設定は保存できますが、プッシュ配信は対応ブラウザ／アプリで有効になります。',
      );
      // 未対応でも設定自体は保存（アプリと共有）
      await apply({ ...settings, [key]: true });
    }
    setPendingKey(null);
  };

  if (!authReady) {
    return (
      <main className="page-main pt-4 md:pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">通知設定</h1>
        <p className="mt-4 text-sm font-bold text-[#8A9199]">読み込み中…</p>
      </main>
    );
  }

  return (
    <main className="page-main pt-4 md:pt-2">
      <Link
        href={settingsBackHref}
        className="text-sm font-extrabold text-[#12B8D0]"
      >
        ← 設定
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">通知設定</h1>
      <p className="mt-1 text-sm font-bold text-[#5B6B75]">
        種類ごとにオン／オフを切り替えられます。変更はすぐに保存されます。
      </p>

      {!user ? (
        <LoginPromptCard title="ログインして通知設定を変更" />
      ) : (
        <>
          <p className="mt-4 text-xs font-bold text-[#8A9199]">
            {browserPermissionLabel(permission)}
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
                  <p className="text-sm font-extrabold">{row.label}</p>
                  <p className="mt-0.5 text-xs font-bold text-[#8A9199]">
                    {row.caption}
                  </p>
                </div>
                <ToggleSwitch
                  checked={settings[row.key]}
                  disabled={!ready || pendingKey !== null}
                  label={row.label}
                  onChange={(next) => void handleToggle(row.key, next)}
                />
              </div>
            ))}
          </section>

          <p className="mt-3 text-xs font-bold leading-5 text-[#8A9199]">
            初めて通知をオンにすると、ブラウザの通知許可が求められます。許可後も種類ごとに切り替えられます。設定はアカウントに保存され、他の端末でも参照できます。
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
  return (
    <Suspense
      fallback={
        <main className="page-main pt-4 md:pt-2">
          <h1 className="text-2xl font-extrabold tracking-tight">通知設定</h1>
          <p className="mt-4 text-sm font-bold text-[#8A9199]">読み込み中…</p>
        </main>
      }
    >
      <NotificationSettingsBody />
    </Suspense>
  );
}
