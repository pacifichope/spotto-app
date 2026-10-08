'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** イベント一覧・マップなど横幅を活かしたいルート */
function isWideLayout(pathname: string) {
  return pathname === '/';
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
