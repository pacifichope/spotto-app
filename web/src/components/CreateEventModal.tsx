'use client';

import { Camera, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createWebEvent, uploadEventImage } from '@/lib/eventCreate';
import {
  CANCEL_POLICY_OPTIONS,
  createEmptyQuestion,
  DEFAULT_CANCEL_POLICY,
  LEVEL_OPTIONS,
  MAX_EVENT_PHOTOS,
  MAX_PRE_QUESTION_OPTIONS,
  MAX_PRE_QUESTIONS,
  OTHER_SPORT_LABEL,
  REGISTRATION_DEADLINE_OPTIONS,
  sanitizeEventItems,
  sanitizePreQuestions,
  sanitizeTargetAgeGroups,
  SPORT_OPTIONS,
  TARGET_AGE_PRESETS,
  TITLE_MAX_LENGTH,
  parseEventItemDraft,
  sortEventSessions,
  sportEmojiForLabel,
  type CreateEventPayload,
  type EventSession,
  type FeeType,
  type PreQuestion,
  type RegistrationDeadlineOffset,
  type ScheduleType,
  type SkillLevel,
} from '@/lib/createEventModel';
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
import { useLocale, useT } from '@/lib/i18n/locale-context';

type FormState = Omit<WebEventDraft, 'id' | 'updatedAt'>;

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

function emptyForm(): FormState {
  return createEmptyDraftPartial();
}

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
  const { locale } = useLocale();
  const router = useRouter();
  const titleId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [itemsBringDraft, setItemsBringDraft] = useState('');
  const [itemsIncludedDraft, setItemsIncludedDraft] = useState('');
  const [ageCustomDraft, setAgeCustomDraft] = useState('');
  const [sessionDraft, setSessionDraft] = useState<EventSession>(() => {
    const base = createEmptyDraftPartial();
    return {
      date: base.date,
      time: base.time,
      endDate: base.endDate,
      endTime: base.endTime,
    };
  });

  useEffect(() => {
    if (!open) return;
    if (draft) {
      setDraftId(draft.id);
      const { id: _id, updatedAt: _u, ...rest } = draft;
      setForm(rest);
    } else {
      setDraftId(null);
      setForm(emptyForm());
    }
    setItemsBringDraft('');
    setItemsIncludedDraft('');
    setAgeCustomDraft('');
    setError('');
    setSaving(false);
    savingRef.current = false;
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
  const isOtherSport = form.sport === OTHER_SPORT_LABEL;
  const remainingSlots = MAX_EVENT_PHOTOS - form.imageUris.length;

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildPayload(): CreateEventPayload | null {
    if (uploading) {
      setError(t('createEvent.alerts.uploading'));
      return null;
    }
    if (form.imageUris.length === 0) {
      setError(t('createEvent.alerts.photoRequired'));
      return null;
    }
    if (!form.title.trim() || !form.location.trim()) {
      setError(t('createEvent.alerts.titleLocationRequired'));
      return null;
    }
    if (!form.description.trim()) {
      setError(t('createEvent.alerts.descriptionRequired'));
      return null;
    }
    if (form.scheduleType === 'recurring' && form.sessions.length === 0) {
      setError(t('createEvent.alerts.sessionsRequired'));
      return null;
    }
    const cap = Math.min(1000, Math.max(1, Number(form.capacity) || 1));
    const price =
      form.feeType === 'paid'
        ? Math.max(0, Math.floor(Number(form.priceYen) || 0))
        : 0;
    if (form.feeType === 'paid' && price < 1) {
      setError(t('createEvent.alerts.priceRequired'));
      return null;
    }
    if (form.feeType === 'paid' && !form.cancelPolicy.trim()) {
      setError(t('createEvent.alerts.cancelPolicyRequired'));
      return null;
    }
    const sportLabel = isOtherSport
      ? form.customSport.trim() || OTHER_SPORT_LABEL
      : form.sport;
    const orderedSessions =
      form.scheduleType === 'recurring'
        ? sortEventSessions(form.sessions)
        : [
            {
              date: form.date,
              time: form.time,
              endDate: form.endDate,
              endTime: form.endTime,
            },
          ];
    const first = orderedSessions[0]!;
    const imageUris = form.imageUris.slice(0, MAX_EVENT_PHOTOS);
    return {
      title: form.title.trim().slice(0, TITLE_MAX_LENGTH),
      sport: sportLabel,
      emoji: sportEmojiForLabel(form.sport) || form.emoji || '🏅',
      level: form.level,
      date: first.date,
      time: first.time,
      endDate: first.endDate,
      endTime: first.endTime,
      sessions: orderedSessions,
      location: form.location.trim(),
      locationNote: form.locationNote.trim() || undefined,
      description: form.description.trim(),
      imageUri: imageUris[0] || '',
      imageUris,
      capacity: cap,
      priceYen: price,
      cancelPolicy: price > 0 ? form.cancelPolicy.trim() : '',
      protection: '主催者サポートのみ',
      scheduleType: form.scheduleType,
      latitude: form.latitude,
      longitude: form.longitude,
      registrationDeadlineOffset: form.registrationDeadlineOffset,
      enablePreQuestions:
        form.enablePreQuestions &&
        sanitizePreQuestions(form.preQuestions).length > 0,
      preQuestions: sanitizePreQuestions(form.preQuestions),
      itemsToBring: sanitizeEventItems([
        ...form.itemsToBring,
        ...parseEventItemDraft(itemsBringDraft),
      ]),
      includedItems: sanitizeEventItems([
        ...form.includedItems,
        ...parseEventItemDraft(itemsIncludedDraft),
      ]),
      targetAgeGroups: sanitizeTargetAgeGroups([
        ...form.targetAgeGroups,
        ageCustomDraft,
      ]),
    };
  }

  function saveDraftLocal() {
    const id = draftId || `draft_${Date.now().toString(36)}`;
    const next: WebEventDraft = {
      ...form,
      id,
      imageUri: form.imageUris[0],
      updatedAt: Date.now(),
    };
    const drafts = upsertEventDraft(userId, next);
    setDraftId(id);
    onDraftSaved(drafts);
    return id;
  }

  async function publish() {
    if (savingRef.current || busy) return;
    if (!hasOrganizerProfileReady(organizer)) {
      setError(t('profile.setClubNameFirst'));
      return;
    }
    const payload = buildPayload();
    if (!payload) return;

    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const result = await createWebEvent({
        getIdToken,
        hostId: userId,
        organizer,
        payload,
        sourceLang: locale === 'en' ? 'en' : 'ja',
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
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function onPickFiles(files: FileList | null) {
    if (!files?.length || uploading) return;
    const room = MAX_EVENT_PHOTOS - form.imageUris.length;
    if (room <= 0) {
      setError(t('createEvent.alerts.photoMax', { count: MAX_EVENT_PHOTOS }));
      return;
    }
    setUploading(true);
    setError('');
    try {
      const selected = Array.from(files).slice(0, room);
      const urls: string[] = [];
      for (const file of selected) {
        const result = await uploadEventImage({ file, getIdToken });
        if (!result.ok) {
          setError(result.error);
          break;
        }
        urls.push(result.url);
      }
      if (urls.length > 0) {
        setForm((prev) => ({
          ...prev,
          imageUris: [...prev.imageUris, ...urls].slice(0, MAX_EVENT_PHOTOS),
        }));
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function removePhoto(uri: string) {
    setForm((prev) => ({
      ...prev,
      imageUris: prev.imageUris.filter((item) => item !== uri),
    }));
  }

  function toggleAge(preset: string) {
    setForm((prev) => {
      const has = prev.targetAgeGroups.includes(preset);
      return {
        ...prev,
        targetAgeGroups: has
          ? prev.targetAgeGroups.filter((item) => item !== preset)
          : sanitizeTargetAgeGroups([...prev.targetAgeGroups, preset]),
      };
    });
  }

  function addSession() {
    if (!sessionDraft.date || !sessionDraft.time) {
      setError(t('createEvent.alerts.sessionIncomplete'));
      return;
    }
    setForm((prev) => ({
      ...prev,
      sessions: sortEventSessions([...prev.sessions, { ...sessionDraft }]),
    }));
    setError('');
  }

  function updateQuestion(id: string, patchQ: Partial<PreQuestion>) {
    setForm((prev) => ({
      ...prev,
      preQuestions: prev.preQuestions.map((q) =>
        q.id === id ? { ...q, ...patchQ } : q,
      ),
    }));
  }

  const field =
    'mt-2 h-11 w-full rounded-2xl border border-[#E4EBEE] bg-[#F4F7F8] px-3.5 text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-[#29D1E8]/35';
  const area =
    'mt-2 w-full resize-y rounded-2xl border border-[#E4EBEE] bg-[#F4F7F8] px-3.5 py-3 text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-[#29D1E8]/35';
  const chip =
    'rounded-full px-3 py-1.5 text-xs font-extrabold ring-1 transition';

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
        className="relative z-10 flex max-h-[min(94dvh,900px)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_24px_64px_rgba(11,26,34,0.28)]"
      >
        <div className="flex items-center justify-between border-b border-[#E4EBEE] px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="text-sm font-extrabold text-[#5B6B75] disabled:opacity-60"
          >
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
            className="text-sm font-extrabold text-[#12B8D0] disabled:opacity-60"
          >
            {t('createEvent.draft')}
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-5">
          {/* Photos */}
          <div>
            <p className="text-xs font-extrabold text-[#5B6B75]">
              {t('createEvent.addPhoto')} ({form.imageUris.length}/{MAX_EVENT_PHOTOS})
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {form.imageUris.map((uri) => (
                <div
                  key={uri}
                  className="relative h-24 w-24 overflow-hidden rounded-2xl bg-[#E5F9FC]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={uri} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removePhoto(uri)}
                    className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-[#12202A]/8 text-white"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {remainingSlots > 0 ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-2xl bg-[#E5F9FC] text-[#12B8D0]"
                >
                  <Camera size={22} />
                  <span className="text-[11px] font-extrabold">
                    {uploading ? t('common.uploading') : t('createEvent.addPhotoShort')}
                  </span>
                </button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => void onPickFiles(event.target.files)}
            />
          </div>

          <label className="block">
            <span className="text-xs font-extrabold text-[#5B6B75]">
              {t('createEvent.fieldTitle')}
            </span>
            <input
              className={field}
              value={form.title}
              maxLength={TITLE_MAX_LENGTH}
              disabled={busy}
              onChange={(e) => patch('title', e.target.value.slice(0, TITLE_MAX_LENGTH))}
            />
            <span className="mt-1 block text-[11px] font-bold text-[#8A9199]">
              {form.title.trim().length}/{TITLE_MAX_LENGTH}
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-extrabold text-[#5B6B75]">
                {t('createEvent.fieldSport')}
              </span>
              <select
                className={field}
                value={form.sport}
                disabled={busy}
                onChange={(e) => {
                  const label = e.target.value;
                  patch('sport', label);
                  patch('emoji', sportEmojiForLabel(label));
                }}
              >
                {SPORT_OPTIONS.map((sport) => (
                  <option key={sport.label} value={sport.label}>
                    {sport.emoji} {sport.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-extrabold text-[#5B6B75]">
                {t('createEvent.fieldLevel')}
              </span>
              <select
                className={field}
                value={form.level}
                disabled={busy}
                onChange={(e) => patch('level', e.target.value as SkillLevel)}
              >
                {LEVEL_OPTIONS.map((level) => (
                  <option key={level} value={level}>
                    {t(`createEvent.levels.${level}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isOtherSport ? (
            <label className="block">
              <span className="text-xs font-extrabold text-[#5B6B75]">
                {t('createEvent.customSport')}
              </span>
              <input
                className={field}
                value={form.customSport}
                disabled={busy}
                onChange={(e) => patch('customSport', e.target.value)}
                placeholder={t('createEvent.customSportPlaceholder')}
              />
            </label>
          ) : null}

          {/* Schedule type */}
          <div>
            <p className="text-xs font-extrabold text-[#5B6B75]">
              {t('createEvent.scheduleType')}
            </p>
            <div className="mt-2 flex gap-2">
              {(['single', 'recurring'] as ScheduleType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  disabled={busy}
                  onClick={() => patch('scheduleType', type)}
                  className={`${chip} ${
                    form.scheduleType === type
                      ? 'bg-[#E5F9FC] text-[#12B8D0] ring-[#29D1E8]/40'
                      : 'bg-white text-[#5B6B75] ring-[#E4EBEE]'
                  }`}
                >
                  {t(`createEvent.schedule.${type}`)}
                </button>
              ))}
            </div>
          </div>

          {form.scheduleType === 'single' ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-extrabold text-[#5B6B75]">
                  {t('createEvent.startDate')}
                </span>
                <input
                  type="date"
                  className={field}
                  value={form.date}
                  disabled={busy}
                  onChange={(e) => patch('date', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs font-extrabold text-[#5B6B75]">
                  {t('createEvent.startTime')}
                </span>
                <input
                  type="time"
                  className={field}
                  value={form.time}
                  disabled={busy}
                  onChange={(e) => patch('time', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs font-extrabold text-[#5B6B75]">
                  {t('createEvent.endDate')}
                </span>
                <input
                  type="date"
                  className={field}
                  value={form.endDate}
                  disabled={busy}
                  onChange={(e) => patch('endDate', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs font-extrabold text-[#5B6B75]">
                  {t('createEvent.endTime')}
                </span>
                <input
                  type="time"
                  className={field}
                  value={form.endTime}
                  disabled={busy}
                  onChange={(e) => patch('endTime', e.target.value)}
                />
              </label>
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-[#E4EBEE] bg-[#FAFCFD] p-3">
              <p className="text-xs font-extrabold text-[#5B6B75]">
                {t('createEvent.sessionsTitle', { count: form.sessions.length })}
              </p>
              {form.sessions.map((session, index) => (
                <div
                  key={`${session.date}-${session.time}-${index}`}
                  className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#12202A] ring-1 ring-[#E4EBEE]"
                >
                  <span>
                    {session.date} {session.time}
                    {session.endTime ? ` – ${session.endDate || session.date} ${session.endTime}` : ''}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        sessions: prev.sessions.filter((_, i) => i !== index),
                      }))
                    }
                    className="text-[#EF4444]"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  className={field}
                  value={sessionDraft.date}
                  disabled={busy}
                  onChange={(e) =>
                    setSessionDraft((prev) => ({ ...prev, date: e.target.value }))
                  }
                />
                <input
                  type="time"
                  className={field}
                  value={sessionDraft.time}
                  disabled={busy}
                  onChange={(e) =>
                    setSessionDraft((prev) => ({ ...prev, time: e.target.value }))
                  }
                />
                <input
                  type="date"
                  className={field}
                  value={sessionDraft.endDate || ''}
                  disabled={busy}
                  onChange={(e) =>
                    setSessionDraft((prev) => ({ ...prev, endDate: e.target.value }))
                  }
                />
                <input
                  type="time"
                  className={field}
                  value={sessionDraft.endTime || ''}
                  disabled={busy}
                  onChange={(e) =>
                    setSessionDraft((prev) => ({ ...prev, endTime: e.target.value }))
                  }
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={addSession}
                className="flex h-10 w-full items-center justify-center gap-1 rounded-full bg-white text-sm font-extrabold text-[#12B8D0] ring-1 ring-[#E4EBEE]"
              >
                <Plus size={16} />
                {t('createEvent.addSession')}
              </button>
            </div>
          )}

          <label className="block">
            <span className="text-xs font-extrabold text-[#5B6B75]">
              {t('createEvent.place')}
            </span>
            <input
              className={field}
              value={form.location}
              disabled={busy}
              onChange={(e) => patch('location', e.target.value)}
              placeholder={t('createEvent.placePlaceholder')}
            />
          </label>
          <label className="block">
            <span className="text-xs font-extrabold text-[#5B6B75]">
              {t('createEvent.placeMemo')}
            </span>
            <input
              className={field}
              value={form.locationNote}
              disabled={busy}
              onChange={(e) => patch('locationNote', e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-xs font-extrabold text-[#5B6B75]">
              {t('createEvent.capacity')}
            </span>
            <input
              type="number"
              min={1}
              max={1000}
              className={field}
              value={form.capacity}
              disabled={busy}
              onChange={(e) =>
                patch(
                  'capacity',
                  Math.min(1000, Math.max(1, Number(e.target.value) || 1)),
                )
              }
            />
          </label>

          {/* Fee */}
          <div>
            <p className="text-xs font-extrabold text-[#5B6B75]">
              {t('createEvent.feeType')}
            </p>
            <div className="mt-2 flex gap-2">
              {(['free', 'paid'] as FeeType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    patch('feeType', type);
                    if (type === 'free') {
                      patch('priceYen', 0);
                      patch('cancelPolicy', '');
                    } else if (!form.cancelPolicy) {
                      patch('cancelPolicy', DEFAULT_CANCEL_POLICY);
                    }
                  }}
                  className={`${chip} ${
                    form.feeType === type
                      ? 'bg-[#E5F9FC] text-[#12B8D0] ring-[#29D1E8]/40'
                      : 'bg-white text-[#5B6B75] ring-[#E4EBEE]'
                  }`}
                >
                  {t(`createEvent.fee.${type}`)}
                </button>
              ))}
            </div>
          </div>

          {form.feeType === 'paid' ? (
            <>
              <label className="block">
                <span className="text-xs font-extrabold text-[#5B6B75]">
                  {t('createEvent.feeAmount')}
                </span>
                <input
                  type="number"
                  min={1}
                  className={field}
                  value={form.priceYen || ''}
                  disabled={busy}
                  onChange={(e) =>
                    patch('priceYen', Math.max(0, Math.floor(Number(e.target.value) || 0)))
                  }
                />
              </label>
              <label className="block">
                <span className="text-xs font-extrabold text-[#5B6B75]">
                  {t('createEvent.cancelPolicy')}
                </span>
                <select
                  className={field}
                  value={form.cancelPolicy || DEFAULT_CANCEL_POLICY}
                  disabled={busy}
                  onChange={(e) => patch('cancelPolicy', e.target.value)}
                >
                  {CANCEL_POLICY_OPTIONS.map((option) => (
                    <option key={option.label} value={option.label}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}

          <label className="block">
            <span className="text-xs font-extrabold text-[#5B6B75]">
              {t('createEvent.deadline')}
            </span>
            <select
              className={field}
              value={String(form.registrationDeadlineOffset)}
              disabled={busy}
              onChange={(e) => {
                const raw = e.target.value;
                const next: RegistrationDeadlineOffset =
                  raw === 'end' ? 'end' : Number(raw);
                patch('registrationDeadlineOffset', next);
              }}
            >
              {REGISTRATION_DEADLINE_OPTIONS.map((option) => (
                <option key={String(option.value)} value={String(option.value)}>
                  {locale === 'en' ? option.labelEn : option.labelJa}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-extrabold text-[#5B6B75]">
              {t('createEvent.description')}
            </span>
            <textarea
              rows={4}
              className={area}
              value={form.description}
              disabled={busy}
              onChange={(e) => patch('description', e.target.value)}
            />
          </label>

          {/* Target age */}
          <div>
            <p className="text-xs font-extrabold text-[#5B6B75]">
              {t('createEvent.targetAge')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TARGET_AGE_PRESETS.map((preset) => {
                const active = form.targetAgeGroups.includes(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    disabled={busy}
                    onClick={() => toggleAge(preset)}
                    className={`${chip} ${
                      active
                        ? 'bg-[#E5F9FC] text-[#12B8D0] ring-[#29D1E8]/40'
                        : 'bg-white text-[#5B6B75] ring-[#E4EBEE]'
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
            <input
              className={field}
              value={ageCustomDraft}
              disabled={busy}
              placeholder={t('createEvent.targetAgeCustom')}
              onChange={(e) => setAgeCustomDraft(e.target.value)}
            />
          </div>

          {/* Items */}
          <label className="block">
            <span className="text-xs font-extrabold text-[#5B6B75]">
              {t('createEvent.itemsToBring')}
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {form.itemsToBring.map((item) => (
                <button
                  key={item}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    patch(
                      'itemsToBring',
                      form.itemsToBring.filter((x) => x !== item),
                    )
                  }
                  className={`${chip} bg-[#E5F9FC] text-[#12B8D0] ring-[#29D1E8]/40`}
                >
                  {item} ×
                </button>
              ))}
            </div>
            <input
              className={field}
              value={itemsBringDraft}
              disabled={busy}
              placeholder={t('createEvent.itemsPlaceholder')}
              onChange={(e) => setItemsBringDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const next = sanitizeEventItems([
                  ...form.itemsToBring,
                  ...parseEventItemDraft(itemsBringDraft),
                ]);
                patch('itemsToBring', next);
                setItemsBringDraft('');
              }}
            />
          </label>

          <label className="block">
            <span className="text-xs font-extrabold text-[#5B6B75]">
              {t('createEvent.includedItems')}
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {form.includedItems.map((item) => (
                <button
                  key={item}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    patch(
                      'includedItems',
                      form.includedItems.filter((x) => x !== item),
                    )
                  }
                  className={`${chip} bg-[#E5F9FC] text-[#12B8D0] ring-[#29D1E8]/40`}
                >
                  {item} ×
                </button>
              ))}
            </div>
            <input
              className={field}
              value={itemsIncludedDraft}
              disabled={busy}
              placeholder={t('createEvent.itemsPlaceholder')}
              onChange={(e) => setItemsIncludedDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const next = sanitizeEventItems([
                  ...form.includedItems,
                  ...parseEventItemDraft(itemsIncludedDraft),
                ]);
                patch('includedItems', next);
                setItemsIncludedDraft('');
              }}
            />
          </label>

          {/* Pre-questions */}
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-xs font-extrabold text-[#5B6B75]">
                {t('createEvent.preQuestions')}
              </span>
              <input
                type="checkbox"
                checked={form.enablePreQuestions}
                disabled={busy}
                onChange={(e) => patch('enablePreQuestions', e.target.checked)}
              />
            </label>
            {form.enablePreQuestions ? (
              <div className="space-y-3">
                {form.preQuestions.map((question, index) => (
                  <div
                    key={question.id}
                    className="rounded-2xl border border-[#E4EBEE] bg-[#FAFCFD] p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-[#5B6B75]">
                        Q{index + 1}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          patch(
                            'preQuestions',
                            form.preQuestions.filter((q) => q.id !== question.id),
                          )
                        }
                        className="text-[#EF4444]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <input
                      className={field}
                      value={question.title}
                      disabled={busy}
                      placeholder={t('createEvent.preQuestionTitle')}
                      onChange={(e) =>
                        updateQuestion(question.id, { title: e.target.value })
                      }
                    />
                    <select
                      className={field}
                      value={question.type}
                      disabled={busy}
                      onChange={(e) =>
                        updateQuestion(question.id, {
                          type: e.target.value as PreQuestion['type'],
                        })
                      }
                    >
                      <option value="text">{t('createEvent.preType.text')}</option>
                      <option value="single">{t('createEvent.preType.single')}</option>
                      <option value="multi">{t('createEvent.preType.multi')}</option>
                    </select>
                    {question.type !== 'text' ? (
                      <div className="mt-2 space-y-2">
                        {question.options.map((option, optIndex) => (
                          <input
                            key={`${question.id}-opt-${optIndex}`}
                            className={field}
                            value={option}
                            disabled={busy}
                            placeholder={t('createEvent.preOption', {
                              n: optIndex + 1,
                            })}
                            onChange={(e) => {
                              const options = [...question.options];
                              options[optIndex] = e.target.value;
                              updateQuestion(question.id, { options });
                            }}
                          />
                        ))}
                        {question.options.length < MAX_PRE_QUESTION_OPTIONS ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              updateQuestion(question.id, {
                                options: [...question.options, ''],
                              })
                            }
                            className="text-xs font-extrabold text-[#12B8D0]"
                          >
                            {t('createEvent.addOption')}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
                {form.preQuestions.length < MAX_PRE_QUESTIONS ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      patch('preQuestions', [
                        ...form.preQuestions,
                        createEmptyQuestion(),
                      ])
                    }
                    className="flex h-10 w-full items-center justify-center gap-1 rounded-full bg-white text-sm font-extrabold text-[#12B8D0] ring-1 ring-[#E4EBEE]"
                  >
                    <Plus size={16} />
                    {t('createEvent.addQuestion')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {error ? <p className="text-sm font-bold text-[#EF4444]">{error}</p> : null}
        </div>

        <div className="flex gap-2 border-t border-[#E4EBEE] bg-[#FAFCFD] px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex h-11 flex-1 items-center justify-center gap-1 rounded-full bg-white text-sm font-extrabold text-[#5B6B75] ring-1 ring-[#E4EBEE] disabled:opacity-60"
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
