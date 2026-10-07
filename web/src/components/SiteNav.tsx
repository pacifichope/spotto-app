'use client';

import { Home, MessageCircle, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { HeaderAuthButton, HeaderGuestHint } from '@/components/AuthControls';
import { useAuth } from '@/lib/auth-context';

const TABS = [
  { href: '/', label: 'ホーム', icon: Home },
  { href: '/messages', label: 'メッセージ', icon: MessageCircle },
  { href: '/mypage', label: 'マイページ', icon: UserRound },
] as const;

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function SiteHeader() {
  const pathname = usePathname();
  const { user, ready } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-white/60 bg-white/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between gap-3 px-4 md:h-16 md:px-7">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="shrink-0 text-xl font-extrabold tracking-tight">
            spotto
          </Link>
          <HeaderGuestHint />
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          {ready ? (
            <span
              className={`hidden rounded-full px-2.5 py-1 text-[11px] font-extrabold sm:inline ${
                user ? 'bg-[#E5F9FC] text-[#12B8D0]' : 'bg-[#F4F7F8] text-[#8A9199]'
              }`}
            >
              {user ? 'ログイン中' : '未ログイン'}
            </span>
          ) : null}
          <nav className="hidden items-center gap-1 md:flex">
            {TABS.map((tab) => {
              const active = isActive(pathname, tab.href);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold ${
                    active ? 'brand-gradient' : 'text-[#5B6B75] hover:bg-white'
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
          <HeaderAuthButton />
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-40 flex justify-around px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 md:hidden">
      {TABS.map((tab) => {
        const active = isActive(pathname, tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-12 min-w-16 flex-col items-center justify-center gap-0.5 text-[11px] font-extrabold ${
              active ? 'text-[#12B8D0]' : 'text-[#8A9199]'
            }`}
          >
            <Icon size={22} strokeWidth={active ? 2.6 : 2} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
