'use client';

import Link from 'next/link';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { LoginPromptCard } from '@/components/AuthControls';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAuth } from '@/lib/auth-context';
import { deleteWebAccount } from '@/lib/account';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import { LEGAL_EXTERNAL_URLS } from '@/lib/legal';
import { mypageHref, parseMyPageMode } from '@/lib/mypageNav';

type Row = {
  key: string;
  label: string;
  caption?: string;
  href?: string;
  external?: boolean;
  danger?: boolean;
  onClick?: () => void;
};

const DELETE_PHRASE = '削除する';

export function SettingsScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, ready, busy, signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const fromMode = searchParams.get('from') || searchParams.get('mode') || '';
  const mypageBackHref = mypageHref({
    mode: parseMyPageMode(new URLSearchParams(`mode=${fromMode}`)),
  });

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
      setMessage(error instanceof Error ? error.message : '削除に失敗しました');
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  if (!ready) {
    return (
      <main className="page-main pt-4 md:pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">設定</h1>
        <p className="mt-4 text-sm font-bold text-[#8A9199]">読み込み中…</p>
      </main>
    );
  }

  const rows: Row[] = [
    {
      key: 'contact',
      label: 'お問い合わせ',
      caption: '不具合報告やご質問',
      href: '/settings/contact',
    },
    {
      key: 'terms',
      label: '利用規約',
      caption: 'サービス利用条件',
      href: LEGAL_EXTERNAL_URLS.terms,
      external: true,
    },
    {
      key: 'privacy',
      label: 'プライバシーポリシー',
      caption: '個人情報の取り扱い',
      href: LEGAL_EXTERNAL_URLS.privacy,
      external: true,
    },
    {
      key: 'tokushoho',
      label: '特定商取引法に基づく表記',
      caption: '販売事業者情報',
      href: LEGAL_EXTERNAL_URLS.tokushoho,
      external: true,
    },
    {
      key: 'notifications',
      label: '通知設定',
      caption: 'リマインダー・チャット・イベント更新',
      href: fromMode
        ? `/settings/notifications?from=${encodeURIComponent(fromMode)}`
        : '/settings/notifications',
    },
    {
      key: 'blocklist',
      label: 'ブロックリスト',
      caption: 'ブロック中のユーザーを確認・解除',
      href: fromMode
        ? `/settings/blocklist?from=${encodeURIComponent(fromMode)}`
        : '/settings/blocklist',
    },
  ];

  if (user) {
    rows.push({
      key: 'delete',
      label: deleting ? '削除中…' : 'アカウントを削除',
      caption: 'すべてのデータが削除されます',
      danger: true,
      onClick: () => {
        setMessage('');
        setDeleteOpen(true);
      },
    });
  }

  return (
    <main className="page-main pt-4 md:pt-2">
      <div className="flex items-center gap-3">
        <Link
          href={mypageBackHref}
          className="text-sm font-extrabold text-[#12B8D0]"
        >
          ← マイページ
        </Link>
      </div>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">設定</h1>

      {!user ? (
        <LoginPromptCard
          title="ログインして設定を開く"
          body="アカウント関連の設定にはログインが必要です。利用規約などは下からも開けます。"
        />
      ) : (
        <section className="card-shadow mt-4 flex items-center gap-4 px-5 py-5">
          {user.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photoURL}
              alt=""
              className="h-12 w-12 rounded-full object-cover"
            />
          ) : (
            <span className="brand-gradient grid h-12 w-12 place-items-center rounded-full text-base font-extrabold">
              {(user.displayName || 'U').slice(0, 1)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold">
              {user.displayName || 'ユーザー'}
            </p>
            {user.email ? (
              <p className="mt-1 truncate text-sm font-bold text-[#5B6B75]">
                {user.email}
              </p>
            ) : null}
          </div>
        </section>
      )}

      <section className="card-shadow mt-4 overflow-hidden">
        {rows.map((row, index) => {
          const className = `flex w-full items-center gap-3 px-5 py-4 text-left ${
            index > 0 ? 'border-t border-[#E4EBEE]' : ''
          } ${row.danger ? 'opacity-100' : ''}`;
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
              {row.external ? (
                <ExternalLink size={16} className="shrink-0 text-[#8A9199]" />
              ) : row.href || row.onClick ? (
                <ChevronRight size={18} className="shrink-0 text-[#8A9199]" />
              ) : null}
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
              disabled={row.danger && deleting}
              onClick={row.onClick}
              className={`${className} disabled:opacity-60`}
            >
              {body}
            </button>
          );
        })}
      </section>

      {message ? (
        <p className="mt-3 text-sm font-bold text-[#EF4444]">{message}</p>
      ) : null}

      <div className="mt-6 text-center">
        {user ? (
          <button
            type="button"
            disabled={busy || deleting}
            onClick={() => {
              setMessage('');
              setLogoutOpen(true);
            }}
            className="text-sm font-extrabold text-[#5B6B75] underline disabled:opacity-60"
          >
            {busy ? '処理中…' : 'ログアウト'}
          </button>
        ) : (
          <Link
            href={mypageBackHref}
            className="text-sm font-extrabold text-[#12B8D0]"
          >
            ログインへ
          </Link>
        )}
      </div>

      <ConfirmDialog
        open={logoutOpen}
        title="ログアウトしますか？"
        description="現在のアカウントからログアウトします。いつでも再度ログインできます。"
        confirmLabel="ログアウトする"
        busy={busy}
        onCancel={() => {
          if (!busy) setLogoutOpen(false);
        }}
        onConfirm={() => void confirmLogout()}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="アカウントを削除しますか？"
        description={
          <>
            <p>
              アカウントを削除すると、参加・主催イベント、お気に入り、チャットなどのデータが
              <span className="font-extrabold text-[#EF4444]">完全に失われます</span>
              。この操作は取り消せません。
            </p>
            <p className="mt-2">本当に削除しますか？</p>
          </>
        }
        confirmLabel="アカウントを削除する"
        tone="destructive"
        busy={deleting}
        confirmPhrase={DELETE_PHRASE}
        onCancel={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </main>
  );
}
