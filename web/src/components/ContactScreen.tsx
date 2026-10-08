'use client';

import { useMemo, useState, type FormEvent } from 'react';

import { BackButton } from '@/components/BackButton';
import { useAuth } from '@/lib/auth-context';
import { apiBaseUrl } from '@/lib/env';
import { useT } from '@/lib/i18n/locale-context';
import { SUPPORT_EMAIL } from '@/lib/legal';

const CATEGORY_KEYS = [
  'catBug',
  'catAccount',
  'catEvent',
  'catOther',
] as const;

type CategoryKey = (typeof CATEGORY_KEYS)[number];

export function ContactScreen() {
  const { user } = useAuth();
  const t = useT();
  const [name, setName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [categoryKey, setCategoryKey] = useState<CategoryKey>('catOther');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const categoryLabel = t(`contact.${categoryKey}`);

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
      category: categoryLabel,
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
          setStatus(t('contact.sent'));
          setMessage('');
          setBusy(false);
          return;
        }
      } catch {
        // mailto fallback
      }
    }

    const subject = encodeURIComponent(`[spotto] ${categoryLabel}`);
    const body = encodeURIComponent(
      [
        payload.message,
        '',
        '---',
        `${t('contact.mailtoName')} ${payload.name}`,
        `${t('contact.mailtoEmail')} ${payload.email}`,
        `${t('contact.mailtoUserId')} ${payload.userId || 'guest'}`,
      ].join('\n'),
    );
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    setStatus(t('contact.mailtoFallback', { email: SUPPORT_EMAIL }));
    setBusy(false);
  }

  return (
    <main className="page-main pt-4 md:pt-2">
      <BackButton fallbackHref="/settings" label={t('contact.backSettings')} />
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{t('contact.title')}</h1>
      <p className="mt-2 text-sm font-bold leading-6 text-[#5B6B75]">
        {t('contact.subtitle')}
      </p>

      <form onSubmit={(e) => void onSubmit(e)} className="card-shadow mt-4 space-y-4 px-5 py-6">
        <label className="block">
          <span className="text-xs font-extrabold text-[#5B6B75]">{t('contact.name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-2xl bg-[#F4F7F8] px-4 text-sm font-bold outline-none ring-1 ring-[#E4EBEE] focus:ring-[#12B8D0]"
            required
          />
        </label>
        <label className="block">
          <span className="text-xs font-extrabold text-[#5B6B75]">{t('contact.email')}</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-2xl bg-[#F4F7F8] px-4 text-sm font-bold outline-none ring-1 ring-[#E4EBEE] focus:ring-[#12B8D0]"
            required
          />
        </label>
        <label className="block">
          <span className="text-xs font-extrabold text-[#5B6B75]">{t('contact.category')}</span>
          <select
            value={categoryKey}
            onChange={(e) => setCategoryKey(e.target.value as CategoryKey)}
            className="mt-1.5 h-11 w-full rounded-2xl bg-[#F4F7F8] px-4 text-sm font-bold outline-none ring-1 ring-[#E4EBEE]"
          >
            {CATEGORY_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`contact.${key}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-extrabold text-[#5B6B75]">{t('contact.body')}</span>
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
          {busy ? t('contact.sending') : t('contact.send')}
        </button>
        {status ? (
          <p className="text-sm font-bold text-[#5B6B75]">{status}</p>
        ) : null}
      </form>
    </main>
  );
}
