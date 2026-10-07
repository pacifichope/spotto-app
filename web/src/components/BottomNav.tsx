'use client';

import { Home, MessageCircle, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'ホーム', icon: Home },
  { href: '/messages', label: 'メッセージ', icon: MessageCircle },
  { href: '/mypage', label: 'マイページ', icon: UserRound },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="glass fixed bottom-0 left-1/2 z-40 flex w-full max-w-[480px] -translate-x-1/2 justify-around rounded-t-3xl px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2">
      {TABS.map((tab) => {
        const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
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
