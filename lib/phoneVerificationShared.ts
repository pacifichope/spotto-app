/** 電話認証まわりの共有ユーティリティ（Firebase / UI 共通） */

import i18n from '@/lib/i18n';
import {
  DEFAULT_PHONE_COUNTRY,
  findPhoneCountry,
  type PhoneCountry,
} from '@/lib/phoneCountries';

/** 全角数字・記号を半角へ */
export function toHalfWidthPhoneChars(input: string) {
  return String(input || '')
    .replace(/[０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    .replace(/[＋]/g, '+')
    .replace(/[‐‑‒–—―ー−]/g, '-')
    .trim();
}

/** 数字のみ抽出（全角→半角込み） */
export function digitsOnly(input: string): string {
  return toHalfWidthPhoneChars(input).replace(/\D/g, '');
}

/** 国内番号用: 数字のみ。国ごとの最大桁でカット */
export function sanitizeNationalDigits(
  input: string,
  country: PhoneCountry = DEFAULT_PHONE_COUNTRY,
): string {
  let digits = digitsOnly(input);

  if (country.iso2 === 'JP') {
    if (digits.startsWith('81') && digits.length >= 11) {
      digits = `0${digits.slice(2)}`;
    }
    if (digits.startsWith('810')) {
      digits = `0${digits.slice(3)}`;
    }
  } else {
    const dial = country.dialCode;
    if (digits.startsWith(dial) && digits.length > country.maxDigits) {
      digits = digits.slice(dial.length);
    }
  }

  return digits.slice(0, country.maxDigits);
}

/** @deprecated sanitizeNationalDigits を使用 */
export function sanitizeJapanNationalDigits(input: string): string {
  return sanitizeNationalDigits(input, DEFAULT_PHONE_COUNTRY);
}

/**
 * 入力中の表示用ハイフン整形（国ごとの groups に従う）
 */
export function formatNationalTyping(
  digits: string,
  country: PhoneCountry = DEFAULT_PHONE_COUNTRY,
): string {
  const d = sanitizeNationalDigits(digits, country);
  if (!d) return '';

  const parts: string[] = [];
  let cursor = 0;
  for (const size of country.groups) {
    if (cursor >= d.length) break;
    parts.push(d.slice(cursor, cursor + size));
    cursor += size;
  }
  if (cursor < d.length) {
    parts.push(d.slice(cursor));
  }
  return parts.filter(Boolean).join('-');
}

/** @deprecated formatNationalTyping を使用 */
export function formatJapanNationalTyping(digits: string): string {
  return formatNationalTyping(digits, DEFAULT_PHONE_COUNTRY);
}

export type PhoneInputValidation = {
  digits: string;
  e164: string | null;
  isComplete: boolean;
  currentDigits: number;
  expectedDigits: number;
  /** 例: "8/11" */
  counterLabel: string;
  hint: string;
  status: 'empty' | 'typing' | 'invalid' | 'valid';
  country: PhoneCountry;
};

/** @deprecated PhoneInputValidation を使用 */
export type JapanPhoneValidation = PhoneInputValidation;

/**
 * 国内番号 + 国情報から E.164 を組み立てる
 */
export function toE164(
  nationalDigits: string,
  country: PhoneCountry = DEFAULT_PHONE_COUNTRY,
): string | null {
  const digits = sanitizeNationalDigits(nationalDigits, country);
  if (digits.length < country.minDigits || digits.length > country.maxDigits) {
    return null;
  }

  if (country.iso2 === 'JP') {
    if (!/^0\d{9,10}$/.test(digits)) return null;
    return `+81${digits.slice(1)}`;
  }

  const national = digits.startsWith('0') ? digits.slice(1) : digits;
  if (!/^\d{6,15}$/.test(national)) return null;
  return `+${country.dialCode}${national}`;
}

/**
 * 日本の携帯・固定を E.164（+81...）に正規化。
 * 例: 09012345678 → +819012345678
 */
export function normalizeJapanPhone(input: string): string | null {
  const raw = toHalfWidthPhoneChars(input);
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return null;

  if (digits.startsWith('+')) {
    if (/^\+81\d{9,10}$/.test(digits)) return digits;
    if (/^\+\d{8,15}$/.test(digits)) return digits;
  }

  let national = digits;
  if (national.startsWith('+81')) {
    national = `0${national.slice(3)}`;
  } else if (national.startsWith('81') && national.length >= 11) {
    national = `0${national.slice(2)}`;
  }

  return toE164(national, DEFAULT_PHONE_COUNTRY);
}

/**
 * 任意入力を E.164 へ（すでに + 付きなら検証のみ）
 */
export function normalizePhoneToE164(
  input: string,
  countryIso2 = 'JP',
): string | null {
  const raw = toHalfWidthPhoneChars(input).replace(/[\s()-]/g, '');
  if (!raw) return null;

  if (raw.startsWith('+')) {
    const compact = `+${raw.slice(1).replace(/\D/g, '')}`;
    return /^\+\d{8,15}$/.test(compact) ? compact : null;
  }

  const country = findPhoneCountry(countryIso2);
  return toE164(raw, country);
}

export function formatPhoneDisplay(phoneE164: string) {
  if (phoneE164.startsWith('+81')) {
    const national = `0${phoneE164.slice(3)}`;
    return formatNationalTyping(national, DEFAULT_PHONE_COUNTRY);
  }
  const m = phoneE164.match(/^\+(\d{1,3})(\d+)$/);
  if (!m) return phoneE164;
  return `+${m[1]} ${m[2]}`;
}

/** 国対応のリアルタイム検証 */
export function validatePhoneInput(
  input: string,
  country: PhoneCountry = DEFAULT_PHONE_COUNTRY,
): PhoneInputValidation {
  const digits = sanitizeNationalDigits(input, country);
  const currentDigits = digits.length;
  const expectedDigits = country.expectedDigits;

  if (!digits) {
    return {
      digits: '',
      e164: null,
      isComplete: false,
      currentDigits: 0,
      expectedDigits,
      counterLabel: '',
      hint: '',
      status: 'empty',
      country,
    };
  }

  const e164 = toE164(digits, country);
  if (e164) {
    const complete =
      country.iso2 === 'JP'
        ? currentDigits >= 10 && currentDigits <= 11
        : currentDigits >= country.minDigits &&
          currentDigits <= country.maxDigits &&
          currentDigits >= Math.min(expectedDigits, country.maxDigits);

    if (complete) {
      return {
        digits,
        e164,
        isComplete: true,
        currentDigits,
        expectedDigits,
        counterLabel: '',
        hint: formatPhoneDisplay(e164),
        status: 'valid',
        country,
      };
    }
  }

  if (currentDigits < country.minDigits) {
    return {
      digits,
      e164: null,
      isComplete: false,
      currentDigits,
      expectedDigits,
      counterLabel: '',
      hint: '',
      status: 'typing',
      country,
    };
  }

  return {
    digits,
    e164: null,
    isComplete: false,
    currentDigits,
    expectedDigits,
    counterLabel: '',
    hint:
      country.iso2 === 'JP'
        ? i18n.t('auth.phoneInput.hintInvalidJp')
        : i18n.t('auth.phoneInput.hintInvalid'),
    status: 'invalid',
    country,
  };
}

/** @deprecated validatePhoneInput を使用 */
export function validateJapanPhoneInput(input: string): PhoneInputValidation {
  return validatePhoneInput(input, DEFAULT_PHONE_COUNTRY);
}

export function isValidOtpCode(code: string) {
  return /^\d{6}$/.test(code.trim());
}

/** OTP 入力を数字6桁に制限 */
export function sanitizeOtpDigits(input: string): string {
  return toHalfWidthPhoneChars(input).replace(/\D/g, '').slice(0, 6);
}

/** NativeFirebaseError などから code + message を取り出す */
export function extractPhoneAuthErrorRaw(error: unknown): string {
  if (error == null) return '';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const e = error as {
      code?: unknown;
      message?: unknown;
      nativeErrorCode?: unknown;
      userInfo?: { code?: unknown; message?: unknown };
    };
    const code = String(e.code || e.nativeErrorCode || e.userInfo?.code || '').trim();
    const message = String(
      e.message || e.userInfo?.message || '',
    ).trim();
    if (code && message) {
      return message.includes(code) ? message : `[${code}] ${message}`;
    }
    if (code) return code;
    if (message) return message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Auth の生エラーをユーザー向け文言（現在の表示言語）へ */
export function formatPhoneAuthError(
  raw: string | null | undefined,
  fallback = i18n.t('errors.phone.sendFailed'),
): string {
  const message = String(raw || '').trim();
  if (!message) return fallback;
  const lower = message.toLowerCase();

  if (
    /invalid.*(phone|number)|phone.*invalid|not a valid phone|auth\/invalid-phone-number/i.test(
      message,
    )
  ) {
    return i18n.t('errors.phone.invalidNumber');
  }
  if (
    /rate.?limit|too many|quota|sms.*limit|exceeded|auth\/too-many-requests/i.test(
      lower,
    ) ||
    /クォータ|回数制限|上限/.test(message)
  ) {
    return i18n.t('errors.phone.rateLimit');
  }
  if (
    /auth\/missing-client-identifier|missing a valid app identifier|play integrity|app.?not.?authorized/i.test(
      lower,
    )
  ) {
    return i18n.t('errors.phone.appVerification');
  }
  if (
    /auth\/captcha-check-failed|recaptcha|app.?verification/i.test(lower)
  ) {
    return i18n.t('errors.phone.recaptcha');
  }
  if (
    /auth\/invalid-verification-code|invalid.?code|code.?expired|auth\/code-expired/i.test(
      lower,
    )
  ) {
    return i18n.t('errors.phone.codeInvalid');
  }
  if (
    /auth\/operation-not-allowed|operation-not-allowed|phone.*not.?enabled|provider.*disabled|sms.*unable.*region|region.*enabled/i.test(
      lower,
    )
  ) {
    return i18n.t('errors.phone.operationNotAllowed');
  }
  if (/billing|BLAZE|upgrade.?project|payment/i.test(lower)) {
    return i18n.t('errors.phone.billing');
  }
  if (/not.?enabled/i.test(lower)) {
    return i18n.t('errors.phone.notEnabled');
  }
  if (/network|fetch|failed to fetch|timeout|econnrefused/i.test(lower)) {
    return i18n.t('errors.phone.network');
  }
  if (message.startsWith('{') || message.startsWith('<') || message.length > 180) {
    try {
      const parsed = JSON.parse(message) as { error?: string; message?: string };
      const nested = parsed.error || parsed.message;
      if (nested && nested !== message) {
        return formatPhoneAuthError(nested, fallback);
      }
    } catch {
      // ignore
    }
    return fallback;
  }
  return message;
}
