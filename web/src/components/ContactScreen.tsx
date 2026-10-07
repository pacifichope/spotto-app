'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';

import { useAuth } from '@/lib/auth-context';
import { apiBaseUrl } from '@/lib/env';
import { SUPPORT_EMAIL } from '@/lib/legal';

const CATEGORIES = [
  '不具合の報告',
  'アカウントについて',
  'イベント・決済について',
  'その他',
] as const;

export function ContactScreen() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]>('その他');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const canSubmit = useMemo(() => {
    return (
      name.trim().length > 0 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
      message.trim().length >= 5
    );
  }, [name, email, message]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setStatus('');

    const payload = {
      name: name.trim(),
      email: email.trim(),
      category,
      message: message.trim(),
      userId: user?.uid,
      authenticated: Boolean(user),
    };

    const base = apiBaseUrl();
    if (base) {
      try {
        const response = await fetch(`${base}/contact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
        });
        if (response.ok) {
          setStatus('送信しました。返信をお待ちください。');
          setMessage('');
          setBusy(false);
          return;
        }
      } catch {
        // mailto fallback
      }
    }

    const subject = encodeURIComponent(`[spotto] ${category}`);
    const body = encodeURIComponent(
      [
        payload.message,
        '',
        '---',
        `お名前: ${payload.name}`,
        `返信用メール: ${payload.email}`,
        `ユーザーID: ${payload.userId || 'guest'}`,
      ].join('\n'),
    );
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    setStatus(`メールアプリが開かない場合は ${SUPPORT_EMAIL} へご連絡ください。`);
    setBusy(false);
  }

  return (
    <main className="pt-4 md:pt-2">
      <Link href="/settings" className="text-sm font-extrabold text-[#12B8D0]">
        ← 設定
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">お問い合わせ</h1>
      <p className="mt-2 text-sm font-bold leading-6 text-[#5B6B75]">
        不具合やご質問はこちらからどうぞ。通常数営業日以内にご返信します。
      </p>

      <form onSubmit={(e) => void onSubmit(e)} className="card-shadow mt-4 space-y-4 px-5 py-6">
        <label className="block">
          <span className="text-xs font-extrabold text-[#5B6B75]">お名前</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-2xl bg-[#F4F7F8] px-4 text-sm font-bold outline-none ring-1 ring-[#E4EBEE] focus:ring-[#12B8D0]"
            required
          />
        </label>
        <label className="block">
          <span className="text-xs font-extrabold text-[#5B6B75]">返信用メール</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-2xl bg-[#F4F7F8] px-4 text-sm font-bold outline-none ring-1 ring-[#E4EBEE] focus:ring-[#12B8D0]"
            required
          />
        </label>
        <label className="block">
          <span className="text-xs font-extrabold text-[#5B6B75]">種別</span>
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as (typeof CATEGORIES)[number])
            }
            className="mt-1.5 h-11 w-full rounded-2xl bg-[#F4F7F8] px-4 text-sm font-bold outline-none ring-1 ring-[#E4EBEE]"
          >
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-extrabold text-[#5B6B75]">内容</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            className="mt-1.5 w-full resize-y rounded-2xl bg-[#F4F7F8] px-4 py-3 text-sm font-bold outline-none ring-1 ring-[#E4EBEE] focus:ring-[#12B8D0]"
            required
            minLength={5}
          />
        </label>
        <button
          type="submit"
          disabled={!canSubmit || busy}
          className="brand-gradient h-12 w-full rounded-full text-sm font-extrabold disabled:opacity-60"
        >
          {busy ? '送信中…' : '送信する'}
        </button>
        {status ? (
          <p className="text-sm font-bold text-[#5B6B75]">{status}</p>
        ) : null}
      </form>
    </main>
  );
}
