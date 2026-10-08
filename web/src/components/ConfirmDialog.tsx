'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  cancelLabel?: string;
  confirmLabel: string;
  /** destructive のとき確認ボタンを赤系にする */
  tone?: 'default' | 'destructive';
  busy?: boolean;
  /**
   * 指定時は入力が一致するまで確認ボタンを無効化（誤タップ防止）。
   * 例: confirmPhrase="削除する"
   */
  confirmPhrase?: string;
  confirmPhraseHint?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  cancelLabel = 'キャンセル',
  confirmLabel,
  tone = 'default',
  busy = false,
  confirmPhrase,
  confirmPhraseHint,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phrase, setPhrase] = useState('');

  const requiresPhrase = Boolean(confirmPhrase);
  const phraseOk = !requiresPhrase || phrase.trim() === confirmPhrase;
  const canConfirm = !busy && phraseOk;

  useEffect(() => {
    if (!open) {
      setPhrase('');
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    const timer = window.setTimeout(() => {
      if (requiresPhrase) inputRef.current?.focus();
    }, 40);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(timer);
    };
  }, [open, busy, onCancel, requiresPhrase]);

  if (!open) return null;

  const confirmClass =
    tone === 'destructive'
      ? 'bg-[#EF4444] text-white hover:bg-[#DC2626] disabled:bg-[#FCA5A5]'
      : 'brand-gradient disabled:opacity-60';

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="閉じる"
        disabled={busy}
        className="absolute inset-0 bg-[#0B1A22]/45 backdrop-blur-md transition-opacity disabled:cursor-not-allowed"
        onClick={() => {
          if (!busy) onCancel();
        }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-white/70 bg-white/95 p-5 shadow-[0_24px_64px_rgba(11,26,34,0.28)] backdrop-blur-xl sm:p-6"
      >
        <div
          className={`mb-4 h-1.5 w-12 rounded-full ${
            tone === 'destructive'
              ? 'bg-[#EF4444]'
              : 'bg-gradient-to-r from-[#29D1E8] to-[#FF9533]'
          }`}
        />
        <h2 id={titleId} className="text-lg font-extrabold tracking-tight text-[#12202A]">
          {title}
        </h2>
        <div id={descId} className="mt-2 text-sm font-bold leading-6 text-[#5B6B75]">
          {description}
        </div>

        {requiresPhrase && confirmPhrase ? (
          <label className="mt-4 block">
            <span className="text-xs font-extrabold text-[#5B6B75]">
              {confirmPhraseHint ?? (
                <>
                  確認のため「
                  <span className="text-[#EF4444]">{confirmPhrase}</span>
                  」と入力してください
                </>
              )}
            </span>
            <input
              ref={inputRef}
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
              placeholder={confirmPhrase}
              className="mt-2 h-11 w-full rounded-2xl border border-[#E4EBEE] bg-[#F4F7F8] px-3.5 text-sm font-bold text-[#12202A] outline-none ring-[#EF4444]/30 placeholder:text-[#8A9199] focus:ring-2 disabled:opacity-60"
            />
          </label>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex h-11 flex-1 items-center justify-center rounded-full bg-[#F4F7F8] text-sm font-extrabold text-[#5B6B75] disabled:opacity-60 sm:flex-none sm:px-5"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={onConfirm}
            className={`flex h-11 flex-1 items-center justify-center rounded-full text-sm font-extrabold sm:flex-none sm:min-w-[9.5rem] sm:px-5 ${confirmClass}`}
          >
            {busy ? '処理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
