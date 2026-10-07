'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { completeLineLoginFromCallback } from '@/lib/firebase';

function LineCallbackInner() {
  const router = useRouter();
  const query = useSearchParams();
  const [message, setMessage] = useState('LINE でログインしています…');

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
          setMessage(error instanceof Error ? error.message : 'LINE ログインに失敗しました');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, router]);

  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-extrabold tracking-tight">LINE ログイン</h1>
      <p className="card-shadow mt-4 px-4 py-8 text-sm font-bold leading-6 text-[#5B6B75]">
        {message}
      </p>
      {message !== 'LINE でログインしています…' ? (
        <a href="/mypage" className="mt-4 inline-block text-sm font-extrabold text-[#12B8D0]">
          マイページへ戻る
        </a>
      ) : null}
    </main>
  );
}

export default function LineCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="px-4 py-16 text-center text-sm font-bold text-[#5B6B75]">
          読み込み中…
        </main>
      }
    >
      <LineCallbackInner />
    </Suspense>
  );
}
