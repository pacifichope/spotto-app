/**
 * 電話番号認証（Firebase Auth Phone Authentication）
 * 送信・検証は Firebase。認証済みフラグは profiles / 端末キャッシュへ保存。
 */
import {
  clearFirebasePhonePending,
  confirmFirebasePhoneOtp,
  isFirebasePhoneAuthAvailable,
  sendFirebasePhoneOtp,
} from '@/lib/firebasePhoneAuth';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import {
  formatPhoneAuthError,
  formatPhoneDisplay,
  isValidOtpCode,
  normalizePhoneToE164,
} from '@/lib/phoneVerificationShared';

export type PhoneVerificationRecord = {
  userId: string;
  phoneE164: string;
  phoneDisplay: string;
  verifiedAt: number;
};

const STORAGE_KEY = '@spotto/phone-verification';

export {
  extractPhoneAuthErrorRaw,
  formatJapanNationalTyping,
  formatNationalTyping,
  formatPhoneAuthError,
  formatPhoneDisplay,
  isValidOtpCode,
  normalizeJapanPhone,
  normalizePhoneToE164,
  sanitizeJapanNationalDigits,
  sanitizeNationalDigits,
  sanitizeOtpDigits,
  validateJapanPhoneInput,
  validatePhoneInput,
} from '@/lib/phoneVerificationShared';

type AsyncStorageType =
  typeof import('@react-native-async-storage/async-storage').default;

function getAsyncStorage(): AsyncStorageType | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-async-storage/async-storage')
      .default as AsyncStorageType;
  } catch {
    return null;
  }
}

export function isFirebasePhoneConfigured() {
  return isFirebasePhoneAuthAvailable();
}

async function loadPhoneVerificationLocal(
  userId: string,
): Promise<PhoneVerificationRecord | null> {
  const storage = getAsyncStorage();
  if (!storage || !userId.trim()) return null;
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PhoneVerificationRecord>;
    if (
      parsed.userId !== userId ||
      typeof parsed.phoneE164 !== 'string' ||
      typeof parsed.verifiedAt !== 'number'
    ) {
      return null;
    }
    return {
      userId: parsed.userId,
      phoneE164: parsed.phoneE164,
      phoneDisplay:
        typeof parsed.phoneDisplay === 'string'
          ? parsed.phoneDisplay
          : formatPhoneDisplay(parsed.phoneE164),
      verifiedAt: parsed.verifiedAt,
    };
  } catch {
    return null;
  }
}

type RemotePhoneRow = {
  is_phone_verified?: boolean | null;
  phone_e164?: string | null;
  phone_verified_at?: string | null;
};

async function loadPhoneVerificationRemote(
  userId: string,
): Promise<PhoneVerificationRecord | null> {
  if (!userId.trim() || !isSupabaseConfigured()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('profiles')
      .select('is_phone_verified, phone_e164, phone_verified_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      if (__DEV__) {
        console.warn('[phone] remote load skipped', error.message);
      }
      return null;
    }

    const row = data as RemotePhoneRow | null;
    const phoneE164 = String(row?.phone_e164 || '').trim();
    const verified = Boolean(row?.is_phone_verified) && Boolean(phoneE164);
    if (!verified) return null;

    const verifiedAt = row?.phone_verified_at
      ? Date.parse(row.phone_verified_at) || Date.now()
      : Date.now();

    return {
      userId,
      phoneE164,
      phoneDisplay: formatPhoneDisplay(phoneE164),
      verifiedAt,
    };
  } catch (error) {
    if (__DEV__) console.warn('[phone] remote load threw', error);
    return null;
  }
}

export async function persistPhoneVerificationRemote(
  userId: string,
  phoneE164: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!userId.trim() || !phoneE164.trim()) {
    return { ok: false, error: 'invalid phone' };
  }
  if (!isSupabaseConfigured()) {
    return { ok: true };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: 'Supabase が未設定です' };
  }

  try {
    const nowIso = new Date().toISOString();
    const { error } = await client.from('profiles').upsert(
      {
        id: userId,
        is_phone_verified: true,
        phone_e164: phoneE164.trim(),
        phone_verified_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: 'id' },
    );

    if (error) {
      if (__DEV__) {
        console.warn('[phone] remote persist failed', error.message);
      }
      return {
        ok: false,
        error:
          error.message.includes('is_phone_verified') ||
          error.message.includes('phone_e164')
            ? '電話認証列が未作成です。supabase/apply_profile_phone_verification.sql を適用してください。'
            : error.message || '電話認証の保存に失敗しました',
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : '電話認証の保存に失敗しました',
    };
  }
}

export async function loadPhoneVerification(
  userId: string,
): Promise<PhoneVerificationRecord | null> {
  if (!userId.trim()) return null;

  const remote = await loadPhoneVerificationRemote(userId);
  if (remote) {
    await savePhoneVerificationLocal(remote);
    return remote;
  }

  const local = await loadPhoneVerificationLocal(userId);
  if (local) {
    void persistPhoneVerificationRemote(userId, local.phoneE164);
  }
  return local;
}

async function savePhoneVerificationLocal(
  record: PhoneVerificationRecord,
): Promise<void> {
  const storage = getAsyncStorage();
  await storage?.setItem(STORAGE_KEY, JSON.stringify(record));
}

export async function savePhoneVerification(
  record: PhoneVerificationRecord,
): Promise<void> {
  await savePhoneVerificationLocal(record);
  await persistPhoneVerificationRemote(record.userId, record.phoneE164);
}

export async function clearPhoneVerification(): Promise<void> {
  clearFirebasePhonePending();
  const storage = getAsyncStorage();
  await storage?.removeItem(STORAGE_KEY);
}

export type PhoneOtpChannel = 'firebase';

export type PhoneOtpRequestResult =
  | {
      ok: true;
      channel: PhoneOtpChannel;
      phoneE164?: string;
    }
  | { ok: false; error: string };

export type PhoneOtpConfirmResult =
  | { ok: true }
  | { ok: false; error: string };

export type RequestPhoneOtpOptions = {
  /** Web の RecaptchaVerifier など */
  appVerifier?: unknown;
};

/**
 * Firebase Auth で SMS 認証コードを送信。
 * phone は国内表記でも可（内部で E.164 に変換）。
 */
export async function requestPhoneOtp(
  phoneInput: string,
  options?: RequestPhoneOtpOptions,
): Promise<PhoneOtpRequestResult & { phoneE164?: string }> {
  const phoneE164 = normalizePhoneToE164(phoneInput);
  if (!phoneE164) {
    return {
      ok: false,
      error:
        '電話番号の形式が正しくありません。国番号と番号を確認してください。',
    };
  }

  if (!isFirebasePhoneAuthAvailable()) {
    return {
      ok: false,
      error:
        'Firebase Auth が未設定です。EXPO_PUBLIC_FIREBASE_* と google-services を設定し、Dev Client を再ビルドしてください。',
    };
  }

  const result = await sendFirebasePhoneOtp(phoneE164, {
    appVerifier: options?.appVerifier as never,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  if (__DEV__) {
    console.log('[phone] OTP requested', {
      phonePrefix: `${phoneE164.slice(0, 5)}…`,
      channel: 'firebase',
    });
  }
  return { ok: true, channel: 'firebase', phoneE164 };
}

/**
 * Firebase confirmationResult.confirm(code) 相当。
 */
export async function confirmPhoneOtp(
  _phoneE164: string,
  codeInput: string,
  _channel: PhoneOtpChannel = 'firebase',
): Promise<PhoneOtpConfirmResult> {
  const code = codeInput.trim();
  if (!isValidOtpCode(code)) {
    return { ok: false, error: '認証コードは6桁の数字です。' };
  }
  return confirmFirebasePhoneOtp(code);
}
