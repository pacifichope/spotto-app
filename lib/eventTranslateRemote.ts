import { getApiBaseUrl } from '@/lib/env';
import { getCurrentAppLanguage } from '@/lib/i18n';
import { getFirebaseIdToken } from '@/lib/firebaseIdToken';
import type { AppLanguage } from '@/lib/languagePreference';

export type EventTranslationResult =
  | {
      ok: true;
      sourceLang: AppLanguage;
      titleJa: string;
      titleEn: string;
      descriptionJa: string;
      descriptionEn: string;
      updatedIds: string[];
    }
  | { ok: false; error: string; skipped?: boolean };

/**
 * イベント作成後にサーバーへ翻訳を依頼する（fire-and-forget 想定）。
 * API キーはサーバー側のみ。失敗しても作成自体は成功扱い。
 */
export async function requestEventTranslation(input: {
  eventIds: string[];
  title: string;
  description: string;
  sourceLang?: AppLanguage;
}): Promise<EventTranslationResult> {
  const eventIds = Array.from(
    new Set(
      (input.eventIds || [])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    ),
  ).slice(0, 40);

  const title = String(input.title || '').trim();
  const description = String(input.description || '').trim();
  if (eventIds.length === 0 || !title) {
    return { ok: false, error: 'missing eventIds or title', skipped: true };
  }

  const base = getApiBaseUrl().replace(/\/$/, '');
  if (!base) {
    return { ok: false, error: 'API base URL missing', skipped: true };
  }

  const token = await getFirebaseIdToken(false);
  if (!token) {
    return { ok: false, error: 'not authenticated', skipped: true };
  }

  const sourceLang = input.sourceLang ?? getCurrentAppLanguage();

  try {
    const response = await fetch(`${base}/events/translate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventIds,
        title,
        description,
        sourceLang,
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      sourceLang?: string;
      titleJa?: string;
      titleEn?: string;
      descriptionJa?: string;
      descriptionEn?: string;
      updatedIds?: string[];
    };

    if (!response.ok || body.ok === false) {
      return {
        ok: false,
        error: body.error || `translate failed (${response.status})`,
      };
    }

    const resolvedSource =
      body.sourceLang === 'en' || body.sourceLang === 'ja'
        ? body.sourceLang
        : sourceLang;

    return {
      ok: true,
      sourceLang: resolvedSource,
      titleJa: String(body.titleJa || '').trim(),
      titleEn: String(body.titleEn || '').trim(),
      descriptionJa: String(body.descriptionJa || '').trim(),
      descriptionEn: String(body.descriptionEn || '').trim(),
      updatedIds: Array.isArray(body.updatedIds)
        ? body.updatedIds.map((id) => String(id)).filter(Boolean)
        : eventIds,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'translate request failed',
    };
  }
}
