'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** 横幅を活かすルート（ホーム・イベント詳細など） */
function isWideLayout(pathname: string) {
  if (pathname === '/') return true;
  if (pathname.startsWith('/event/')) return true;
  if (pathname.startsWith('/clubs')) return true;
  return false;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/';
  const wide = isWideLayout(pathname);

  return (
    <div className={wide ? 'app-shell app-shell--wide' : 'app-shell app-shell--compact'}>
      {children}
    </div>
  );
}

export function useWideLayout() {
  const pathname = usePathname() || '/';
  return isWideLayout(pathname);
}
