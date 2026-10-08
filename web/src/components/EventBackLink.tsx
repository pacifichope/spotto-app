'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { useT } from '@/lib/i18n/locale-context';
import { parseEventBackNav } from '@/lib/mypageNav';

function EventBackLinkInner() {
  const searchParams = useSearchParams();
  const t = useT();
  const { href, labelKey } = parseEventBackNav(searchParams);

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[#5B6B75] transition-colors hover:text-[#12B8D0]"
    >
      <span aria-hidden>←</span>
      {t(labelKey)}
    </Link>
  );
}

/** クエリの from に応じて戻る先を切り替えるリンク */
export function EventBackLink() {
  const t = useT();
  return (
    <Suspense
      fallback={
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[#5B6B75] transition-colors hover:text-[#12B8D0]"
        >
          <span aria-hidden>←</span>
          {t('event.backToList')}
        </Link>
      }
    >
      <EventBackLinkInner />
    </Suspense>
  );
}
