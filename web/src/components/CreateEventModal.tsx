'use client';

import { Camera, Plus, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { CATEGORIES } from '@/constants/theme';
import {
  createWebEvent,
  uploadEventImage,
  type CreateEventInput,
} from '@/lib/eventCreate';
import {
  createEmptyDraftPartial,
  deleteEventDraft,
  upsertEventDraft,
  type WebEventDraft,
} from '@/lib/eventDrafts';
import {
  hasOrganizerProfileReady,
  type WebOrganizerProfile,
} from '@/lib/organizerProfile';
import { useT } from '@/lib/i18n/locale-context';

const LEVELS = [
  { value: '初心者歓迎', key: 'createEvent.levelBeginner' },
  { value: '初級', key: 'createEvent.levelElementary' },
  { value: '中級', key: 'createEvent.levelIntermediate' },
  { value: '上級', key: 'createEvent.levelAdvanced' },
  { value: '指定なし', key: 'createEvent.levelAny' },
] as const;
const SPORTS = CATEGORIES.filter(
  (item) => item.id !== 'all' && item.id !== 'hot',
).map((item) => item.label);

type Props = {
  open: boolean;
  userId: string;
  organizer: WebOrganizerProfile;
  draft?: WebEventDraft | null;
  getIdToken: () => Promise<string | null>;
  onClose: () => void;
  onPublished: () => void;
  onDraftSaved: (drafts: WebEventDraft[]) => void;
};

export function CreateEventModal({
  open,
  userId,
  organizer,
  draft,
  getIdToken,
  onClose,
  onPublished,
  onDraftSaved,
}: Props) {
  const t = useT();
  const router = useRouter();
  const titleId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<CreateEventInput>(() => ({
    ...createEmptyDraftPartial(),
    imageUri: '',
  }));
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (draft) {
      setDraftId(draft.id);
      setForm({
        title: draft.title,
        sport: draft.sport,
        level: draft.level,
        date: draft.date,
        time: draft.time,
        endDate: draft.endDate,
        endTime: draft.endTime,
        location: draft.location,
        locationNote: draft.locationNote,
        latitude: draft.latitude,
        longitude: draft.longitude,
        description: draft.description,
        capacity: draft.capacity,
        priceYen: draft.priceYen,
        imageUri: draft.imageUri || '',
      });
    } else {
      setDraftId(null);
      setForm({ ...createEmptyDraftPartial(), imageUri: '' });
    }
    setError('');
    setSaving(false);
    setUploading(false);
  }, [open, draft]);

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

  function patch<K extends keyof CreateEventInput>(key: K, value: CreateEventInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function saveDraftLocal() {
    const id = draftId || `draft_${Date.now().toString(36)}`;
    const next: WebEventDraft = {
      id,
      title: form.title,
      sport: form.sport,
      level: form.level,
      date: form.date,
      time: form.time,
      endDate: form.endDate,
      endTime: form.endTime,
      location: form.location,
      locationNote: form.locationNote || '',
      latitude: form.latitude,
      longitude: form.longitude,
      description: form.description,
      capacity: form.capacity,
      priceYen: form.priceYen,
      imageUri: form.imageUri || undefined,
      updatedAt: Date.now(),
    };
    const drafts = upsertEventDraft(userId, next);
    setDraftId(id);
    onDraftSaved(drafts);
    return id;
  }

  async function publish() {
    if (!hasOrganizerProfileReady(organizer)) {
      setError(t('profile.setClubNameFirst'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await createWebEvent({
        getIdToken,
        hostId: userId,
        organizer,
        payload: form,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (draftId) {
        onDraftSaved(deleteEventDraft(userId, draftId));
      }
      onPublished();
      onClose();
      router.push(`/event/${result.event.id}`);
    } finally {
      setSaving(false);
    }
  }

  const field =
    'mt-2 h-11 w-full rounded-2xl border border-[#E4EBEE] bg-[#F4F7F8] px-3.5 text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-[#29D1E8]/35';

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center p-3 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label={t('common.close')}
        disabled={busy}
        className="absolute inset-0 bg-[#0B1A22]/5 backdrop-blur-md"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(94dvh,840px)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_24px_64px_rgba(11,26,34,0.28)]"
      >
        <div className="flex items-center justify-between border-b border-[#E4EBEE] px-5 py-4">
          <button type="button" disabled={busy} onClick={onClose} className="text-sm font-extrabold text-[#5B6B75]">
            {t('common.close')}
          </button>
          <h2 id={titleId} className="text-base font-extrabold">
            {draftId ? t('createEvent.editDraft') : t('createEvent.title')}
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              saveDraftLocal();
              onClose();
            }}
            className="text-sm font-extrabold text-[#12B8D0]"
          >
            {t('createEvent.draft')}
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-5">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-3xl bg-[#E5F9FC]"
          >
            {form.imageUri ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.imageUri} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-2 text-sm font-extrabold text-[#12B8D0]">
                <Camera size={28} />
                {uploading ? t('common.uploading') : t('createEvent.addPhoto')}
              </span>
            )}
            <span className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-[#12202A] text-white">
              <Plus size={18} />
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
              void uploadEventImage({ file, getIdToken }).then((result) => {
                setUploading(false);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                patch('imageUri', result.url);
              });
            }}
          />

          <label className="block">
            <span className="text-xs font-extrabold text-[#5B6B75]">{t('createEvent.fieldTitle')}</span>
            <input className={field} value={form.title} maxLength={80} onChange={(e) => patch('title', e.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-extrabold text-[#5B6B75]">{t('createEvent.fieldSport')}</span>
              <select className={field} value={form.sport} onChange={(e) => patch('sport', e.target.value)}>
                {SPORTS.map((sport) => (
                  <option key={sport} value={sport}>
                    {sport}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-extrabold text-[#5B6B75]">{t('createEvent.fieldLevel')}</span>
              <select className={field} value={form.level} onChange={(e) => patch('level', e.target.value)}>
                {LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {t(level.key)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-extrabold text-[#5B6B75]">{t('createEvent.startDate')}</span>
              <input type="date" className={field} value={form.date} onChange={(e) => patch('date', e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-extrabold text-[#5B6B75]">{t('createEvent.startTime')}</span>
              <input type="time" className={field} value={form.time} onChange={(e) => patch('time', e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-extrabold text-[#5B6B75]">{t('createEvent.endDate')}</span>
              <input type="date" className={field} value={form.endDate} onChange={(e) => patch('endDate', e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-extrabold text-[#5B6B75]">{t('createEvent.endTime')}</span>
              <input type="time" className={field} value={form.endTime} onChange={(e) => patch('endTime', e.target.value)} />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-extrabold text-[#5B6B75]">{t('createEvent.place')}</span>
            <input className={field} value={form.location} onChange={(e) => patch('location', e.target.value)} placeholder={t('createEvent.placePlaceholder')} />
          </label>
          <label className="block">
            <span className="text-xs font-extrabold text-[#5B6B75]">{t('createEvent.placeMemo')}</span>
            <input className={field} value={form.locationNote || ''} onChange={(e) => patch('locationNote', e.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-extrabold text-[#5B6B75]">{t('createEvent.capacity')}</span>
              <input
                type="number"
                min={1}
                className={field}
                value={form.capacity}
                onChange={(e) => patch('capacity', Number(e.target.value) || 1)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-extrabold text-[#5B6B75]">{t('createEvent.fee')}</span>
              <input
                type="number"
                min={0}
                className={field}
                value={form.priceYen}
                onChange={(e) => patch('priceYen', Number(e.target.value) || 0)}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-extrabold text-[#5B6B75]">{t('createEvent.description')}</span>
            <textarea
              rows={4}
              className="mt-2 w-full resize-none rounded-2xl border border-[#E4EBEE] bg-[#F4F7F8] px-3.5 py-3 text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-[#29D1E8]/35"
              value={form.description}
              onChange={(e) => patch('description', e.target.value)}
            />
          </label>

          {error ? <p className="text-sm font-bold text-[#EF4444]">{error}</p> : null}
        </div>

        <div className="flex gap-2 border-t border-[#E4EBEE] bg-[#FAFCFD] px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex h-11 flex-1 items-center justify-center gap-1 rounded-full bg-white text-sm font-extrabold text-[#5B6B75] ring-1 ring-[#E4EBEE]"
          >
            <X size={16} />
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void publish()}
            className="brand-gradient flex h-11 flex-1 items-center justify-center rounded-full text-sm font-extrabold disabled:opacity-60"
          >
            {saving ? t('common.publishing') : t('common.publish')}
          </button>
        </div>
      </div>
    </div>
  );
}
