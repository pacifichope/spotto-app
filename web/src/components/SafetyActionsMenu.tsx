'use client';

import { MoreVertical } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  blockUserRemote,
  unblockUserRemote,
} from '@/lib/blocks';
import { useT } from '@/lib/i18n/locale-context';
import {
  REPORT_REASON_KEYS,
  submitUserReport,
} from '@/lib/reports';

const MAX_REASON = 400;

type Target = {
  id: string;
  name: string;
  imageUri?: string;
};

type Props = {
  target: Target;
  currentUserId: string;
  getIdToken: () => Promise<string | null>;
  isBlocked?: boolean;
  onBlockedChange?: (blocked: boolean) => void;
  /** ブロック成功後（一覧から外すなど） */
  onBlocked?: () => void;
};

type SheetStep = 'closed' | 'menu' | 'report' | 'reportDone';

export function SafetyActionsMenu({
  target,
  currentUserId,
  getIdToken,
  isBlocked = false,
  onBlockedChange,
  onBlocked,
}: Props) {
  const t = useT();
  const menuId = useId();
  const [step, setStep] = useState<SheetStep>('closed');
  const [preset, setPreset] = useState<string>(REPORT_REASON_KEYS[0]);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (step === 'closed') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        setStep('closed');
        setBlockConfirmOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, busy]);

  if (target.id === currentUserId) return null;

  const presetLabel = t(preset);
  const reason =
    preset === 'safety.reasonOther'
      ? detail.trim()
      : detail.trim()
        ? `${presetLabel}: ${detail.trim()}`
        : presetLabel;

  const closeAll = () => {
    if (busy) return;
    setStep('closed');
    setError('');
    setDetail('');
    setPreset(REPORT_REASON_KEYS[0]);
    setBlockConfirmOpen(false);
  };

  const submitReport = async () => {
    if (!reason || busy) return;
    setBusy(true);
    setError('');
    const result = await submitUserReport({
      reporterId: currentUserId,
      targetUserId: target.id,
      targetName: target.name,
      targetType: 'user',
      reason,
      getIdToken,
    });
    setBusy(false);
    if (!result.ok) {
      setError(
        result.error.startsWith('errors.') || result.error.startsWith('safety.')
          ? t(result.error)
          : result.error,
      );
      return;
    }
    setStep('reportDone');
  };

  const confirmBlock = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (isBlocked) {
        await unblockUserRemote({
          userId: currentUserId,
          blockedId: target.id,
          getIdToken,
        });
        onBlockedChange?.(false);
      } else {
        await blockUserRemote({
          userId: currentUserId,
          target,
          getIdToken,
        });
        onBlockedChange?.(true);
        onBlocked?.();
      }
      setBlockConfirmOpen(false);
      setStep('closed');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : isBlocked
            ? t('safety.unblockFailed')
            : t('safety.blockFailed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label={t('safety.menuAria')}
        aria-haspopup="menu"
        aria-expanded={step !== 'closed'}
        aria-controls={menuId}
        onClick={() => setStep((prev) => (prev === 'closed' ? 'menu' : 'closed'))}
        className="grid h-8 w-8 place-items-center rounded-full bg-[#F4F7F8] text-[#5B6B75] transition hover:bg-[#E5F9FC] hover:text-[#12B8D0]"
      >
        <MoreVertical size={16} strokeWidth={2.4} />
      </button>

      {step === 'menu' ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            aria-label={t('common.close')}
            className="absolute inset-0 bg-[#0B1A22]/45 backdrop-blur-md"
            onClick={closeAll}
          />
          <div
            id={menuId}
            role="menu"
            className="relative z-10 w-full max-w-sm overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_24px_64px_rgba(11,26,34,0.28)]"
          >
            <p className="truncate border-b border-[#E4EBEE] px-5 py-3 text-center text-xs font-extrabold text-[#8A9199]">
              {target.name}
            </p>
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                setError('');
                if (isBlocked) {
                  void confirmBlock();
                  return;
                }
                setStep('closed');
                setBlockConfirmOpen(true);
              }}
              className={`flex w-full items-center justify-center px-5 py-4 text-sm font-extrabold ${
                isBlocked ? 'text-[#12202A]' : 'text-[#EF4444]'
              }`}
            >
              {isBlocked ? t('safety.unblock') : t('safety.block')}
            </button>
            <div className="border-t border-[#E4EBEE]" />
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                setError('');
                setStep('report');
              }}
              className="flex w-full items-center justify-center px-5 py-4 text-sm font-extrabold text-[#EF4444]"
            >
              {t('safety.report')}
            </button>
            <div className="border-t border-[#E4EBEE]" />
            <button
              type="button"
              onClick={closeAll}
              className="flex w-full items-center justify-center px-5 py-4 text-sm font-extrabold text-[#5B6B75]"
            >
              {t('common.cancel')}
            </button>
            {error ? (
              <p className="border-t border-[#E4EBEE] px-5 py-3 text-center text-xs font-bold text-[#EF4444]">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === 'report' || step === 'reportDone' ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            aria-label={t('common.close')}
            disabled={busy}
            className="absolute inset-0 bg-[#0B1A22]/45 backdrop-blur-md"
            onClick={closeAll}
          />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-white/70 bg-white p-5 shadow-[0_24px_64px_rgba(11,26,34,0.28)] sm:p-6">
            {step === 'report' ? (
              <>
                <h3 className="text-lg font-extrabold tracking-tight">{t('safety.reportTitle')}</h3>
                <p className="mt-1 text-sm font-bold text-[#5B6B75]">
                  {t('safety.reportHint', { name: target.name })}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {REPORT_REASON_KEYS.map((item) => {
                    const active = preset === item;
                    return (
                      <button
                        key={item}
                        type="button"
                        disabled={busy}
                        onClick={() => setPreset(item)}
                        className={`rounded-full px-3 py-1.5 text-xs font-extrabold ring-1 ${
                          active
                            ? 'bg-[#E5F9FC] text-[#0284C7] ring-[#12B8D0]/50'
                            : 'bg-white text-[#5B6B75] ring-[#E4EBEE]'
                        }`}
                      >
                        {t(item)}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  value={detail}
                  disabled={busy}
                  maxLength={MAX_REASON}
                  rows={4}
                  onChange={(event) => setDetail(event.target.value)}
                  placeholder={
                    preset === 'safety.reasonOther'
                      ? t('safety.detailRequired')
                      : t('safety.detailOptional')
                  }
                  className="mt-4 w-full resize-none rounded-2xl border border-[#E4EBEE] bg-[#F4F7F8] px-4 py-3 text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-[#29D1E8]/35"
                />
                <p className="mt-1 text-right text-[11px] font-bold text-[#8A9199]">
                  {detail.length}/{MAX_REASON}
                </p>
                {error ? (
                  <p className="mt-2 text-sm font-bold text-[#EF4444]">{error}</p>
                ) : null}
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setError('');
                      setStep('menu');
                    }}
                    className="flex h-11 flex-1 items-center justify-center rounded-full bg-white text-sm font-extrabold text-[#5B6B75] ring-1 ring-[#E4EBEE]"
                  >
                    {t('safety.back')}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !reason}
                    onClick={() => void submitReport()}
                    className="brand-gradient flex h-11 flex-1 items-center justify-center rounded-full text-sm font-extrabold disabled:opacity-60"
                  >
                    {busy ? t('safety.submitting') : t('safety.submit')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-extrabold tracking-tight">{t('safety.doneTitle')}</h3>
                <p className="mt-2 text-sm font-bold leading-6 text-[#5B6B75]">
                  {t('safety.doneBody')}
                </p>
                <button
                  type="button"
                  onClick={closeAll}
                  className="brand-gradient mt-5 flex h-11 w-full items-center justify-center rounded-full text-sm font-extrabold"
                >
                  {t('safety.close')}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={blockConfirmOpen}
        title={t('safety.blockTitle')}
        description={t('safety.blockBody')}
        confirmLabel={t('safety.blockConfirm')}
        tone="destructive"
        busy={busy}
        onCancel={() => {
          if (!busy) setBlockConfirmOpen(false);
        }}
        onConfirm={() => void confirmBlock()}
      />
    </div>
  );
}
