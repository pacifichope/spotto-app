'use client';

import { Camera, Pencil, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { uploadOrganizerAvatar } from '@/lib/eventCreate';
import {
  hasOrganizerProfileReady,
  saveOrganizerProfile,
  type WebOrganizerProfile,
} from '@/lib/organizerProfile';

type Props = {
  open: boolean;
  userId: string;
  profile: WebOrganizerProfile;
  getIdToken: () => Promise<string | null>;
  onClose: () => void;
  onSaved: (profile: WebOrganizerProfile) => void;
};

export function OrganizerProfileModal({
  open,
  userId,
  profile,
  getIdToken,
  onClose,
  onSaved,
}: Props) {
  const titleId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(profile);
    setError('');
    setSaving(false);
    setUploading(false);
  }, [open, profile]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const busy = saving || uploading;
  const preview = draft.name.trim() || 'サークル';

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="閉じる"
        disabled={busy}
        className="absolute inset-0 bg-[#0B1A22]/45 backdrop-blur-md"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(92dvh,720px)] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_24px_64px_rgba(11,26,34,0.28)]"
      >
        <div className="flex items-center justify-between border-b border-[#E4EBEE] px-5 py-4">
          <button type="button" disabled={busy} onClick={onClose} className="text-sm font-extrabold text-[#5B6B75]">
            キャンセル
          </button>
          <h2 id={titleId} className="text-base font-extrabold">
            サークル情報
          </h2>
          <button
            type="button"
            disabled={busy}
            className="text-sm font-extrabold text-[#12B8D0] disabled:opacity-60"
            onClick={() => {
              setSaving(true);
              setError('');
              const result = saveOrganizerProfile(userId, draft);
              setSaving(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              onSaved(result.profile);
              onClose();
            }}
          >
            保存
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-6">
          <div className="flex flex-col items-center">
            <button
              type="button"
              disabled={busy}
              className="relative"
              onClick={() => fileRef.current?.click()}
            >
              {draft.imageUri ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.imageUri} alt="" className="h-24 w-24 rounded-full object-cover ring-4 ring-[#E5F9FC]" />
              ) : (
                <span className="brand-gradient grid h-24 w-24 place-items-center rounded-full text-2xl font-extrabold ring-4 ring-[#E5F9FC]">
                  {preview.slice(0, 1)}
                </span>
              )}
              <span className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-[#12202A] text-white ring-2 ring-white">
                <Camera size={14} />
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setUploading(true);
                setError('');
                void uploadOrganizerAvatar({ file, getIdToken }).then((result) => {
                  setUploading(false);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setDraft((prev) => ({ ...prev, imageUri: result.url }));
                });
              }}
            />
          </div>

          <label className="mt-6 block">
            <span className="text-xs font-extrabold text-[#5B6B75]">サークル名</span>
            <input
              value={draft.name}
              maxLength={30}
              disabled={busy}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="3〜30文字"
              className="mt-2 h-12 w-full rounded-2xl border border-[#E4EBEE] bg-[#F4F7F8] px-4 text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-[#29D1E8]/35"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-xs font-extrabold text-[#5B6B75]">紹介文</span>
            <textarea
              value={draft.bio}
              maxLength={500}
              disabled={busy}
              rows={4}
              onChange={(event) => setDraft((prev) => ({ ...prev, bio: event.target.value }))}
              placeholder="活動内容や雰囲気を書いてみましょう"
              className="mt-2 w-full resize-none rounded-2xl border border-[#E4EBEE] bg-[#F4F7F8] px-4 py-3 text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-[#29D1E8]/35"
            />
          </label>

          {!hasOrganizerProfileReady(draft) ? (
            <p className="mt-3 text-xs font-bold text-[#8A9199]">
              イベント作成にはサークル名（3文字以上）の設定が必要です。
            </p>
          ) : null}
          {error ? <p className="mt-3 text-sm font-bold text-[#EF4444]">{error}</p> : null}
        </div>

        <div className="flex gap-2 border-t border-[#E4EBEE] bg-[#FAFCFD] px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-white text-sm font-extrabold text-[#5B6B75] ring-1 ring-[#E4EBEE]"
          >
            <X size={16} />
            キャンセル
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setSaving(true);
              setError('');
              const result = saveOrganizerProfile(userId, draft);
              setSaving(false);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              onSaved(result.profile);
              onClose();
            }}
            className="brand-gradient flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-extrabold"
          >
            <Pencil size={15} />
            保存する
          </button>
        </div>
      </div>
    </div>
  );
}
