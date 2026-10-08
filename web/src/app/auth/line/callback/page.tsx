'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { PulseBlock } from '@/components/skeletons';
import { completeLineLoginFromCallback } from '@/lib/firebase';
import { useT } from '@/lib/i18n/locale-context';

function LineCallbackInner() {
  const t = useT();
  const router = useRouter();
  const query = useSearchParams();
  const [message, setMessage] = useState(() => t('auth.lineBusy'));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await completeLineLoginFromCallback({
          code: query.get('code'),
          state: query.get('state'),
          error: query.get('error'),
          errorDescription: query.get('error_description'),
        });
        if (!cancelled) router.replace('/mypage');
      } catch (error) {
        if (!cancelled) {
          setFailed(true);
          setMessage(
            error instanceof Error ? error.message : t('auth.lineFailed'),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, router, t]);

  return (
    <main className="page-main px-1 py-16 text-center">
      <h1 className="text-xl font-extrabold tracking-tight">{t('auth.lineTitle')}</h1>
      <p className="card-shadow mt-4 px-4 py-8 text-sm font-bold leading-6 text-[#5B6B75]">
        {message}
      </p>
      {failed ? (
        <a href="/mypage" className="mt-4 inline-block text-sm font-extrabold text-[#12B8D0]">
          {t('auth.lineBackMypage')}
        </a>
      ) : null}
    </main>
  );
}

export default function LineCallbackPage() {
  const t = useT();
  return (
    <Suspense
      fallback={
        <main className="px-4 py-16">
          <PulseBlock className="mx-auto h-10 w-40" />
        </main>
      }
    >
      <LineCallbackInner />
    </Suspense>
  );
}
