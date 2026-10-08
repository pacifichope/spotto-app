'use client';

import { Camera, ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { SnsBrandIcon } from '@/components/SnsBrandIcon';
import { uploadOrganizerAvatar } from '@/lib/eventCreate';
import {
  hasOrganizerProfileReady,
  persistOrganizerProfile,
  uploadOrganizerCover,
  type WebOrganizerProfile,
} from '@/lib/organizerProfile';
import {
  createSnsLinkId,
  detectSnsKind,
  isValidHttpUrl,
  normalizeSnsUrl,
  SNS_KIND_OPTIONS,
  type SnsKind,
  type SnsLink,
} from '@/lib/snsLinks';

type Props = {
  open: boolean;
  userId: string;
  profile: WebOrganizerProfile;
  getIdToken: () => Promise<string | null>;
  onClose: () => void;
  onSaved: (profile: WebOrganizerProfile) => void;
};

function emptyLink(kind: SnsKind = 'instagram'): SnsLink {
  return { id: createSnsLinkId(), kind, url: '' };
}

export function OrganizerProfileModal({
  open,
  userId,
  profile,
  getIdToken,
  onClose,
  onSaved,
}: Props) {
  const titleId = useId();
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(profile);
  const [snsDrafts, setSnsDrafts] = useState<SnsLink[]>(
    profile.snsLinks.length > 0 ? profile.snsLinks : [],
  );
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(profile);
    setSnsDrafts(profile.snsLinks.length > 0 ? profile.snsLinks : []);
    setError('');
    setSaving(false);
    setUploadingAvatar(false);
    setUploadingCover(false);
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

  const busy = saving || uploadingAvatar || uploadingCover;
  const preview = draft.name.trim() || 'サークル';

  const updateLink = (id: string, patch: Partial<SnsLink>) => {
    setSnsDrafts((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        if (typeof patch.url === 'string' && patch.url.trim() && !patch.kind) {
          next.kind = detectSnsKind(patch.url);
        }
        return next;
      }),
    );
  };

  const handleSave = async () => {
    if (busy) return;
    setSaving(true);
    setError('');
    const links = snsDrafts
      .map((item) => ({
        ...item,
        url: normalizeSnsUrl(item.url),
      }))
      .filter((item) => item.url.length > 0);
    const invalid = links.find((item) => !isValidHttpUrl(item.url));
    if (invalid) {
      setSaving(false);
      setError('URL の形式を確認してください（https://...）');
      return;
    }
    const result = await persistOrganizerProfile({
      userId,
      getIdToken,
      profile: { ...draft, snsLinks: links },
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.profile);
    onClose();
  };

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
        className="relative z-10 flex max-h-[min(94dvh,820px)] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_24px_64px_rgba(11,26,34,0.28)]"
      >
        <div className="flex items-center justify-between border-b border-[#E4EBEE] px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="text-sm font-extrabold text-[#5B6B75]"
          >
            キャンセル
          </button>
          <h2 id={titleId} className="text-base font-extrabold">
            サークル情報
          </h2>
          <button
            type="button"
            disabled={busy}
            className="text-sm font-extrabold text-[#12B8D0] disabled:opacity-60"
            onClick={() => void handleSave()}
          >
            保存
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          <p className="text-xs font-extrabold text-[#5B6B75]">カバー写真</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => coverRef.current?.click()}
            className="relative mt-2 block w-full overflow-hidden rounded-2xl bg-[#E5F9FC]"
          >
            {draft.coverUri ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={draft.coverUri}
                alt=""
                className="h-36 w-full object-cover sm:h-40"
              />
            ) : (
              <span className="flex h-36 w-full flex-col items-center justify-center gap-2 text-[#12B8D0] sm:h-40">
                <ImagePlus size={28} strokeWidth={2.2} />
                <span className="text-sm font-extrabold">Add cover photo</span>
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-[#0B1A22]/45 px-3 py-2 text-center text-xs font-extrabold text-white">
              {uploadingCover
                ? 'アップロード中…'
                : draft.coverUri
                  ? 'Set cover photo'
                  : 'Add cover photo'}
            </span>
          </button>
          <input
            ref={coverRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              setUploadingCover(true);
              setError('');
              void uploadOrganizerCover({ file, getIdToken }).then((result) => {
                setUploadingCover(false);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setDraft((prev) => ({ ...prev, coverUri: result.url }));
              });
            }}
          />
          <p className="mt-1.5 text-[11px] font-bold text-[#8A9199]">
            クラブ詳細ページのヘッダーに表示されます
          </p>

          <div className="mt-5 flex flex-col items-center">
            <button
              type="button"
              disabled={busy}
              className="relative"
              onClick={() => avatarRef.current?.click()}
            >
              {draft.imageUri ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.imageUri}
                  alt=""
                  className="h-24 w-24 rounded-full object-cover ring-4 ring-[#E5F9FC]"
                />
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
              ref={avatarRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                setUploadingAvatar(true);
                setError('');
                void uploadOrganizerAvatar({ file, getIdToken }).then((result) => {
                  setUploadingAvatar(false);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setDraft((prev) => ({ ...prev, imageUri: result.url }));
                });
              }}
            />
            <p className="mt-2 text-xs font-bold text-[#8A9199]">
              {uploadingAvatar ? 'アップロード中…' : 'アイコンを変更'}
            </p>
          </div>

          <label className="mt-5 block">
            <span className="text-xs font-extrabold text-[#5B6B75]">サークル名</span>
            <input
              value={draft.name}
              maxLength={30}
              disabled={busy}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, name: event.target.value }))
              }
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
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, bio: event.target.value }))
              }
              placeholder="活動内容や雰囲気を書いてみましょう"
              className="mt-2 w-full resize-none rounded-2xl border border-[#E4EBEE] bg-[#F4F7F8] px-4 py-3 text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-[#29D1E8]/35"
            />
          </label>

          <div className="mt-5">
            <p className="text-xs font-extrabold text-[#5B6B75]">
              SNS / Web (optional, multiple allowed)
            </p>
            <p className="mt-1 text-[11px] font-bold text-[#8A9199]">
              Instagram・X・LINE・公式サイトなどを追加できます
            </p>

            <div className="mt-3 space-y-3">
              {snsDrafts.map((link, index) => (
                <div
                  key={link.id}
                  className="rounded-2xl border border-[#E4EBEE] bg-[#FAFCFD] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-extrabold text-[#5B6B75]">
                      リンク {index + 1}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label="リンクを削除"
                      onClick={() =>
                        setSnsDrafts((prev) =>
                          prev.filter((item) => item.id !== link.id),
                        )
                      }
                      className="grid h-8 w-8 place-items-center rounded-full text-[#EF4444] hover:bg-[#FEE2E2]"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {SNS_KIND_OPTIONS.map((option) => {
                      const active = link.kind === option.kind;
                      return (
                        <button
                          key={option.kind}
                          type="button"
                          disabled={busy}
                          onClick={() => updateLink(link.id, { kind: option.kind })}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-extrabold ring-1 transition ${
                            active
                              ? 'bg-white text-[#12202A] ring-[#12B8D0]'
                              : 'bg-white/70 text-[#5B6B75] ring-[#E4EBEE]'
                          }`}
                        >
                          <SnsBrandIcon kind={option.kind} size={22} />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    value={link.url}
                    disabled={busy}
                    onChange={(event) =>
                      updateLink(link.id, { url: event.target.value })
                    }
                    placeholder="https://..."
                    className="mt-2 h-11 w-full rounded-xl border border-[#E4EBEE] bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[#29D1E8]/35"
                  />
                </div>
              ))}
            </div>

            {snsDrafts.length < 8 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setSnsDrafts((prev) => [...prev, emptyLink()])}
                className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-extrabold text-[#12B8D0] ring-1 ring-[#E4EBEE]"
              >
                <Plus size={16} strokeWidth={2.4} />
                Add link
              </button>
            ) : null}
          </div>

          {!hasOrganizerProfileReady(draft) ? (
            <p className="mt-3 text-xs font-bold text-[#8A9199]">
              イベント作成にはサークル名（3文字以上）の設定が必要です。
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm font-bold text-[#EF4444]">{error}</p>
          ) : null}
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
            onClick={() => void handleSave()}
            className="brand-gradient flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-extrabold disabled:opacity-60"
          >
            <Pencil size={15} />
            {saving ? '保存中…' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  );
}
