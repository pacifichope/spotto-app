import Constants from 'expo-constants';
import { router } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { InteractionManager, Platform } from 'react-native';

import PhoneVerificationModal from '@/components/PhoneVerificationModal';
import { useAuth } from '@/lib/authContext';
import {
  clearPhoneVerification,
  confirmPhoneOtp,
  formatPhoneDisplay,
  loadPhoneVerification,
  requestPhoneOtp,
  savePhoneVerification,
  type PhoneVerificationRecord,
} from '@/lib/phoneVerification';

/** シミュレータでは SMS が使えず決済確認を阻害するため、DEV では本人確認をスキップ */
function shouldSkipPhoneVerificationInDev() {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return false;
  const flag = String(process.env.EXPO_PUBLIC_SKIP_PHONE_VERIFY || '')
    .trim()
    .toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'yes') return true;
  if (flag === '0' || flag === 'false' || flag === 'no') return false;
  // 未指定時: シミュレータ / エミュレータのみスキップ
  return Constants.isDevice === false;
}

function pushPhoneAuthRoute() {
  if (Platform.OS === 'web') return;
  InteractionManager.runAfterInteractions(() => {
    try {
      router.navigate('/auth/phone');
      if (__DEV__) console.log('[phone] navigated to /auth/phone');
    } catch (error) {
      if (__DEV__) {
        console.warn('[phone] router.navigate(/auth/phone) failed', error);
      }
      try {
        router.push('/auth/phone');
      } catch (retryError) {
        if (__DEV__) {
          console.warn('[phone] router.push(/auth/phone) failed', retryError);
        }
      }
    }
  });
}

export type OpenPhoneVerificationOptions = {
  /** true のとき閉じる／「あとで」不可 */
  required?: boolean;
};

type PhoneVerificationContextValue = {
  isReady: boolean;
  isPhoneVerified: boolean;
  phoneDisplay: string | null;
  phoneE164: string | null;
  /** Join ゲートなどで「あとで」不可かどうか */
  isPhoneGateRequired: boolean;
  /**
   * 未認証なら本人確認を開き、完了後に resume を呼ぶ。
   * 認証済みなら true。未認証（画面表示中）なら false。
   */
  requirePhoneVerified: (resume?: () => void) => boolean;
  openPhoneVerification: (
    resume?: () => void,
    options?: OpenPhoneVerificationOptions,
  ) => void;
  closePhoneVerification: () => void;
  /** OTP 成功後の保存・resume（/auth/phone 埋め込み用） */
  completePhoneVerification: (phoneE164: string) => Promise<void>;
  refreshPhoneVerification: () => Promise<void>;
  clearLocalPhoneVerification: () => Promise<void>;
};

const PhoneVerificationContext =
  createContext<PhoneVerificationContextValue | null>(null);

export function PhoneVerificationProvider({ children }: { children: ReactNode }) {
  const { user, isLoggedIn } = useAuth();
  const [isReady, setIsReady] = useState(false);
  const [record, setRecord] = useState<PhoneVerificationRecord | null>(null);
  const [visible, setVisible] = useState(false);
  const [required, setRequired] = useState(false);
  const pendingResume = useRef<(() => void) | null>(null);

  const refreshPhoneVerification = useCallback(async () => {
    if (!user?.id) {
      setRecord(null);
      setIsReady(true);
      return;
    }
    const next = await loadPhoneVerification(user.id);
    setRecord(next);
    setIsReady(true);
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    setIsReady(false);
    void (async () => {
      try {
        if (!user?.id) {
          if (!cancelled) {
            setRecord(null);
            setIsReady(true);
          }
          return;
        }
        const next = await loadPhoneVerification(user.id);
        if (cancelled) return;
        setRecord(next);
        setIsReady(true);
      } catch {
        if (!cancelled) setIsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, isLoggedIn]);

  const clearLocalPhoneVerification = useCallback(async () => {
    await clearPhoneVerification();
    setRecord(null);
  }, []);

  const openPhoneVerification = useCallback(
    (resume?: () => void, options?: OpenPhoneVerificationOptions) => {
      // resume 未指定時は既存の pending（参加ゲート等）を消さない
      if (resume) {
        pendingResume.current = resume;
      }
      if (options && typeof options.required === 'boolean') {
        setRequired(options.required);
      }
      if (__DEV__) {
        console.log('[phone] openPhoneVerification', {
          hasResume: Boolean(pendingResume.current),
          required: options?.required,
          platform: Platform.OS,
        });
      }
      // ネイティブは /auth/phone に埋め込み表示（root Modal は見えないことがある）
      if (Platform.OS === 'web') {
        setVisible(true);
        return;
      }
      setVisible(false);
      pushPhoneAuthRoute();
    },
    [],
  );

  const closePhoneVerification = useCallback(() => {
    if (required) return;
    setVisible(false);
    setRequired(false);
    // 「あとで」は処理を中断する（resume は破棄）
    pendingResume.current = null;
  }, [required]);

  const requirePhoneVerified = useCallback(
    (resume?: () => void) => {
      if (record?.phoneE164) return true;
      if (shouldSkipPhoneVerificationInDev()) {
        if (__DEV__) {
          console.log(
            '[phone] requirePhoneVerified skipped (dev / simulator)',
          );
        }
        return true;
      }
      pendingResume.current = resume ?? null;
      setRequired(true);
      if (__DEV__) {
        console.log('[phone] requirePhoneVerified → /auth/phone');
      }
      if (Platform.OS === 'web') {
        setVisible(true);
      } else {
        setVisible(false);
        pushPhoneAuthRoute();
      }
      return false;
    },
    [record?.phoneE164],
  );

  const completePhoneVerification = useCallback(
    async (phoneE164: string) => {
      if (!user?.id) {
        setVisible(false);
        setRequired(false);
        return;
      }
      try {
        const next: PhoneVerificationRecord = {
          userId: user.id,
          phoneE164,
          phoneDisplay: formatPhoneDisplay(phoneE164),
          verifiedAt: Date.now(),
        };
        await savePhoneVerification(next);
        setRecord(next);
        setVisible(false);
        setRequired(false);
        const resume = pendingResume.current;
        pendingResume.current = null;
        // /auth/phone の back と競合しないよう、遷移が落ち着いてから再開
        setTimeout(() => {
          try {
            resume?.();
          } catch (error) {
            if (__DEV__) {
              console.warn('[phone] resume after verify failed', error);
            }
          }
        }, 280);
      } catch (error) {
        if (__DEV__) {
          console.warn('[phone] save after verify failed', error);
        }
        throw error instanceof Error
          ? error
          : new Error('認証結果の保存に失敗しました。');
      }
    },
    [user?.id],
  );

  const value = useMemo<PhoneVerificationContextValue>(
    () => ({
      isReady,
      isPhoneVerified: Boolean(record?.phoneE164),
      phoneDisplay: record?.phoneDisplay ?? null,
      phoneE164: record?.phoneE164 ?? null,
      isPhoneGateRequired: required,
      requirePhoneVerified,
      openPhoneVerification,
      closePhoneVerification,
      completePhoneVerification,
      refreshPhoneVerification,
      clearLocalPhoneVerification,
    }),
    [
      clearLocalPhoneVerification,
      closePhoneVerification,
      completePhoneVerification,
      isReady,
      openPhoneVerification,
      record,
      refreshPhoneVerification,
      requirePhoneVerified,
      required,
    ],
  );

  return (
    <PhoneVerificationContext.Provider value={value}>
      {children}
      {/* Web のみ root Modal。ネイティブは /auth/phone 埋め込み */}
      {Platform.OS === 'web' ? (
        <PhoneVerificationModal
          visible={visible}
          required={required}
          onClose={closePhoneVerification}
          onVerified={completePhoneVerification}
          requestOtp={async (phoneInput, options) => {
            try {
              return await requestPhoneOtp(phoneInput, options);
            } catch (error) {
              return {
                ok: false as const,
                error:
                  error instanceof Error
                    ? error.message
                    : '認証コードの送信に失敗しました。',
              };
            }
          }}
          confirmOtp={async (phoneE164, code, channel) => {
            try {
              return await confirmPhoneOtp(phoneE164, code, channel);
            } catch (error) {
              return {
                ok: false as const,
                error:
                  error instanceof Error
                    ? error.message
                    : '認証コードの確認に失敗しました。',
              };
            }
          }}
        />
      ) : null}
    </PhoneVerificationContext.Provider>
  );
}

export function usePhoneVerification() {
  const ctx = useContext(PhoneVerificationContext);
  if (!ctx) {
    throw new Error(
      'usePhoneVerification must be used within PhoneVerificationProvider',
    );
  }
  return ctx;
}

/**
 * イベント参加（チケット購入含む）前のゲート:
 * ログイン → BAN → プロフィール → 電話番号認証。
 */
export function useJoinEventAccess() {
  const { requireAuth, requireCompleteProfile, ensureNotBanned } = useAuth();
  const { requirePhoneVerified } = usePhoneVerification();

  return useCallback(
    (onReady: () => void) => {
      const afterPhone = () => {
        onReady();
      };
      const afterProfile = () => {
        if (!requirePhoneVerified(afterPhone)) return;
        afterPhone();
      };
      const afterLogin = () => {
        void (async () => {
          if (!(await ensureNotBanned())) return;
          if (!requireCompleteProfile(afterProfile)) return;
          afterProfile();
        })();
      };
      if (!requireAuth(afterLogin, 'join-event')) return;
      afterLogin();
    },
    [
      ensureNotBanned,
      requireAuth,
      requireCompleteProfile,
      requirePhoneVerified,
    ],
  );
}
