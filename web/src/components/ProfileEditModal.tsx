'use client';

import { Camera, Pencil, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { User } from 'firebase/auth';

import {
  saveWebProfile,
  uploadProfileAvatar,
  type WebUserGender,
  type WebUserProfile,
} from '@/lib/profile';
import { useT } from '@/lib/i18n/locale-context';

type ProfileEditModalProps = {
  open: boolean;
  user: User;
  profile: WebUserProfile;
  getIdToken: () => Promise<string | null>;
  onClose: () => void;
  onSaved: (profile: WebUserProfile) => void;
};

const GENDER_IDS: Exclude<WebUserGender, ''>[] = ['男性', '女性'];

export function ProfileEditModal({
  open,
  user,
  profile,
  getIdToken,
  onClose,
  onSaved,
}: ProfileEditModalProps) {
  const t = useT();
  const titleId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<WebUserProfile>(profile);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(profile);
    setSaving(false);
    setUploading(false);
    setError('');
  }, [open, profile]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving && !uploading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, saving, uploading, onClose]);

  if (!open) return null;

  const busy = saving || uploading;
  const previewName = draft.name.trim() || t('common.user');

  async function onPickFile(file: File | undefined) {
    if (!file || uploading) return;
    setError('');
    setUploading(true);
    try {
      const result = await uploadProfileAvatar({ file, getIdToken });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft((prev) => ({ ...prev, imageUri: result.url }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onSave() {
    if (busy) return;
    const name = draft.name.trim();
    if (!name) {
      setError(t('profile.nameRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await saveWebProfile({
        user,
        profile: { ...draft, name },
        getIdToken,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.profile);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label={t('common.close')}
        disabled={busy}
        className="absolute inset-0 bg-[#0B1A22]/45 backdrop-blur-md disabled:cursor-not-allowed"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(92dvh,720px)] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_24px_64px_rgba(11,26,34,0.28)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#E4EBEE] px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="text-sm font-extrabold text-[#5B6B75] disabled:opacity-60"
          >
            {t('common.cancel')}
          </button>
          <h2 id={titleId} className="text-base font-extrabold tracking-tight">
            {t('profile.editTitle')}
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSave()}
            className="text-sm font-extrabold text-[#12B8D0] disabled:opacity-60"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-6">
          <div className="flex flex-col items-center">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="group relative"
              aria-label={t('profile.changePhoto')}
            >
              {draft.imageUri ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.imageUri}
                  alt=""
                  className="h-28 w-28 rounded-full object-cover ring-4 ring-[#E5F9FC]"
                />
              ) : (
                <span className="brand-gradient grid h-28 w-28 place-items-center rounded-full text-3xl font-extrabold ring-4 ring-[#E5F9FC]">
                  {previewName.slice(0, 1)}
                </span>
              )}
              <span className="absolute bottom-1 right-1 grid h-9 w-9 place-items-center rounded-full bg-[#12202A] text-white shadow-md ring-2 ring-white transition group-hover:bg-[#12B8D0]">
                {uploading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <Camera size={16} strokeWidth={2.4} />
                )}
              </span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="mt-3 text-sm font-extrabold text-[#12B8D0] disabled:opacity-60"
            >
              {uploading ? t('common.uploading') : t('profile.changePhotoShort')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => void onPickFile(event.target.files?.[0])}
            />
          </div>

          <label className="mt-8 block">
            <span className="text-xs font-extrabold text-[#5B6B75]">{t('profile.name')}</span>
            <input
              value={draft.name}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, name: event.target.value }))
              }
              disabled={busy}
              maxLength={40}
              placeholder={t('profile.namePlaceholder')}
              className="mt-2 h-12 w-full rounded-2xl border border-[#E4EBEE] bg-[#F4F7F8] px-4 text-sm font-bold text-[#12202A] outline-none ring-[#29D1E8]/35 placeholder:text-[#8A9199] focus:bg-white focus:ring-2 disabled:opacity-60"
            />
          </label>

          <fieldset className="mt-5">
            <legend className="text-xs font-extrabold text-[#5B6B75]">{t('profile.gender')}</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {GENDER_IDS.map((id) => {
                const active = draft.gender === id;
                const label = id === '男性' ? t('common.male') : t('common.female');
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={busy}
                    aria-pressed={active}
                    onClick={() =>
                      setDraft((prev) => ({ ...prev, gender: id }))
                    }
                    className={`h-11 rounded-2xl text-sm font-extrabold transition disabled:opacity-60 ${
                      active
                        ? 'brand-gradient shadow-sm'
                        : 'bg-[#F4F7F8] text-[#5B6B75] ring-1 ring-[#E4EBEE]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] font-bold leading-5 text-[#8A9199]">
              {t('profile.genderHint')}
            </p>
          </fieldset>

          {error ? (
            <p className="mt-4 text-sm font-bold text-[#EF4444]">{error}</p>
          ) : null}
        </div>

        <div className="flex gap-2 border-t border-[#E4EBEE] bg-[#FAFCFD] px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-white text-sm font-extrabold text-[#5B6B75] ring-1 ring-[#E4EBEE] disabled:opacity-60"
          >
            <X size={16} />
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSave()}
            className="brand-gradient flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-extrabold disabled:opacity-60"
          >
            <Pencil size={15} />
            {saving ? t('common.saving') : t('common.saveAction')}
          </button>
        </div>
      </div>
    </div>
  );
}
