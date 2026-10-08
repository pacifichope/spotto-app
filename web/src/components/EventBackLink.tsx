'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { BackButton } from '@/components/BackButton';
import { useT } from '@/lib/i18n/locale-context';
import { parseEventBackNav } from '@/lib/mypageNav';

function EventBackLinkInner() {
  const searchParams = useSearchParams();
  const t = useT();
  const { href, labelKey } = parseEventBackNav(searchParams);

  return (
    <BackButton
      fallbackHref={href}
      label={
        <>
          <span aria-hidden>←</span>
          {t(labelKey)}
        </>
      }
      className="text-[#5B6B75] hover:text-[#12B8D0]"
    />
  );
}

/** クエリの from に応じて戻る先を切り替える（履歴優先） */
export function EventBackLink() {
  const t = useT();
  return (
    <Suspense
      fallback={
        <BackButton
          fallbackHref="/"
          label={
            <>
              <span aria-hidden>←</span>
              {t('event.backToList')}
            </>
          }
          className="text-[#5B6B75] hover:text-[#12B8D0]"
        />
      }
    >
      <EventBackLinkInner />
    </Suspense>
  );
}
