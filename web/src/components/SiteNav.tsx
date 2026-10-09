'use client';

import { Home, MessageCircle, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useWideLayout } from '@/components/AppShell';
import { HeaderAccountButton } from '@/components/AuthControls';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useAuth } from '@/lib/auth-context';
import { prefetchInboxThreads } from '@/lib/chatsWeb';
import { idTokenWithAuthenticatedRole } from '@/lib/firebase';
import { useT } from '@/lib/i18n/locale-context';

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function SiteHeader() {
  const pathname = usePathname();
  const { user, ready } = useAuth();
  const wide = useWideLayout();
  const t = useT();

  const tabs = [
    { href: '/', label: t('nav.home'), icon: Home },
    { href: '/messages', label: t('nav.messages'), icon: MessageCircle },
  ] as const;

  const prefetchMessages = () => {
    if (!user) return;
    prefetchInboxThreads({
      userId: user.uid,
      getIdToken: async () => idTokenWithAuthenticatedRole(user),
    });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/60 bg-white/75 backdrop-blur-md">
      <div
        className={`mx-auto flex h-14 w-full flex-nowrap items-center justify-between gap-4 px-4 md:h-16 md:gap-6 md:px-7 xl:px-10 ${
          wide ? 'max-w-[90rem]' : 'max-w-3xl'
        }`}
      >
        <Link
          href="/"
          className="shrink-0 transition-opacity hover:opacity-85"
          aria-label="spotto"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/spotto-logo.png"
            alt="Spotto"
            width={148}
            height={32}
            className="h-7 w-auto max-w-[7.5rem] object-contain object-left md:h-8 md:max-w-[9rem]"
            decoding="async"
          />
        </Link>

        <div className="flex shrink-0 flex-nowrap items-center gap-2 sm:gap-2.5 md:gap-3">
          {ready ? (
            <span
              className={`hidden whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-extrabold sm:inline ${
                user ? 'bg-[#E5F9FC] text-[#12B8D0]' : 'bg-[#F4F7F8] text-[#8A9199]'
              }`}
            >
              {user ? t('common.loggedIn') : t('common.loggedOut')}
            </span>
          ) : null}
          <nav className="hidden flex-nowrap items-center gap-1.5 md:flex">
            {tabs.map((tab) => {
              const active = isActive(pathname, tab.href);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  onPointerEnter={
                    tab.href === '/messages' ? prefetchMessages : undefined
                  }
                  onFocus={tab.href === '/messages' ? prefetchMessages : undefined}
                  className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-extrabold ${
                    active ? 'brand-gradient' : 'text-[#5B6B75] hover:bg-white'
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
          <LanguageSwitcher placement="header" />
          <HeaderAccountButton />
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const t = useT();

  const tabs = [
    { href: '/', label: t('nav.home'), icon: Home },
    { href: '/messages', label: t('nav.messages'), icon: MessageCircle },
    { href: '/mypage', label: t('nav.mypage'), icon: UserRound },
  ] as const;

  const prefetchMessages = () => {
    if (!user) return;
    prefetchInboxThreads({
      userId: user.uid,
      getIdToken: async () => idTokenWithAuthenticatedRole(user),
    });
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="flex justify-center px-3 pb-1">
        <LanguageSwitcher placement="footer" />
      </div>
      <nav className="glass flex justify-around px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              onPointerEnter={
                tab.href === '/messages' ? prefetchMessages : undefined
              }
              onFocus={tab.href === '/messages' ? prefetchMessages : undefined}
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
    </div>
  );
}
