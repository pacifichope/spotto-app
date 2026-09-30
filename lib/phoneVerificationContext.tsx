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

export type OpenPhoneVerificationOptions = {
  /** true のとき閉じる／「あとで」不可 */
  required?: boolean;
};

type PhoneVerificationContextValue = {
  isReady: boolean;
  isPhoneVerified: boolean;
  phoneDisplay: string | null;
  phoneE164: string | null;
  /**
   * 未認証なら本人確認シートを直接開き、完了後に resume を呼ぶ。
   * 認証済みなら true。未認証（シート表示中）なら false。
   */
  requirePhoneVerified: (resume?: () => void) => boolean;
  openPhoneVerification: (
    resume?: () => void,
    options?: OpenPhoneVerificationOptions,
  ) => void;
  closePhoneVerification: () => void;
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
    setIsReady(false);
    void refreshPhoneVerification();
  }, [refreshPhoneVerification, isLoggedIn]);

  const clearLocalPhoneVerification = useCallback(async () => {
    await clearPhoneVerification();
    setRecord(null);
  }, []);

  const openPhoneVerification = useCallback(
    (resume?: () => void, options?: OpenPhoneVerificationOptions) => {
      pendingResume.current = resume ?? null;
      setRequired(Boolean(options?.required));
      setVisible(true);
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
      // 確認ポップアップは出さず、本人確認シートを直接表示
      pendingResume.current = resume ?? null;
      setRequired(false);
      setVisible(true);
      return false;
    },
    [record?.phoneE164],
  );

  const handleVerified = useCallback(
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
        setTimeout(() => {
          try {
            resume?.();
          } catch (error) {
            if (__DEV__) {
              console.warn('[phone] resume after verify failed', error);
            }
          }
        }, 80);
      } catch (error) {
        if (__DEV__) {
          console.warn('[phone] save after verify failed', error);
        }
        // 保存失敗時はモーダルを開いたままにし、呼び出し側でメッセージ表示
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
      requirePhoneVerified,
      openPhoneVerification,
      closePhoneVerification,
      refreshPhoneVerification,
      clearLocalPhoneVerification,
    }),
    [
      clearLocalPhoneVerification,
      closePhoneVerification,
      isReady,
      openPhoneVerification,
      record,
      refreshPhoneVerification,
      requirePhoneVerified,
    ],
  );

  return (
    <PhoneVerificationContext.Provider value={value}>
      {children}
      <PhoneVerificationModal
        visible={visible}
        required={required}
        onClose={closePhoneVerification}
        onVerified={handleVerified}
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
