import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  KeyboardFormScrollView,
  type KeyboardFormScrollViewRef,
} from '@/components/KeyboardForm';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PhoneNumberInput from '@/components/PhoneNumberInput';
import { theme } from '@/constants/theme';
import { ensureWebRecaptchaVerifier } from '@/lib/firebasePhoneAuth';
import { DEFAULT_PHONE_COUNTRY, type PhoneCountry } from '@/lib/phoneCountries';
import {
  extractPhoneAuthErrorRaw,
  formatPhoneAuthError,
  formatPhoneDisplay,
  isValidOtpCode,
  sanitizeOtpDigits,
  validatePhoneInput,
  type PhoneOtpChannel,
  type PhoneOtpConfirmResult,
  type PhoneOtpRequestResult,
} from '@/lib/phoneVerification';

type Step = 'phone' | 'code';

type PhoneVerificationModalProps = {
  visible: boolean;
  /** true のとき閉じる／スキップ不可 */
  required?: boolean;
  onClose: () => void;
  onVerified: (phoneE164: string) => void | Promise<void>;
  requestOtp: (
    phoneInput: string,
    options?: { appVerifier?: unknown },
  ) => Promise<PhoneOtpRequestResult & { phoneE164?: string }>;
  confirmOtp: (
    phoneE164: string,
    code: string,
    channel: PhoneOtpChannel,
  ) => Promise<PhoneOtpConfirmResult>;
};

const RESEND_COOLDOWN_SEC = 60;
const OTP_LEN = 6;

export default function PhoneVerificationModal({
  visible,
  required = false,
  onClose,
  onVerified,
  requestOtp,
  confirmOtp,
}: PhoneVerificationModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const phoneInputRef = useRef<TextInput>(null);
  const codeInputRef = useRef<TextInput>(null);
  const scrollRef = useRef<KeyboardFormScrollViewRef>(null);
  const submittingRef = useRef(false);
  const autoVerifyRef = useRef('');

  const [step, setStep] = useState<Step>('phone');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountry>(
    DEFAULT_PHONE_COUNTRY,
  );
  const [code, setCode] = useState('');
  const [phoneE164, setPhoneE164] = useState('');
  const [channel, setChannel] = useState<PhoneOtpChannel>('firebase');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resendSec, setResendSec] = useState(0);
  const [codeFocused, setCodeFocused] = useState(false);

  const phoneValidation = useMemo(
    () => validatePhoneInput(phoneDigits, phoneCountry),
    [phoneDigits, phoneCountry],
  );
  const canSend =
    phoneValidation.isComplete &&
    !submitting &&
    phoneValidation.status === 'valid' &&
    Boolean(phoneValidation.e164);
  const canVerify = isValidOtpCode(code) && !submitting;

  useEffect(() => {
    if (!visible) return;
    setStep('phone');
    setPhoneDigits('');
    setPhoneCountry(DEFAULT_PHONE_COUNTRY);
    setCode('');
    setPhoneE164('');
    setChannel('firebase');
    setError('');
    setSubmitting(false);
    submittingRef.current = false;
    autoVerifyRef.current = '';
    setResendSec(0);
    const t = setTimeout(() => phoneInputRef.current?.focus(), 280);
    return () => clearTimeout(t);
  }, [visible]);

  useEffect(() => {
    if (step !== 'code' || !visible) return;
    const t = setTimeout(() => codeInputRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, [step, visible]);

  useEffect(() => {
    if (resendSec <= 0) return;
    const id = setInterval(() => {
      setResendSec((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resendSec]);

  const beginSubmit = () => {
    if (submittingRef.current) return false;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    return true;
  };

  const endSubmit = () => {
    submittingRef.current = false;
    setSubmitting(false);
  };

  const sendCode = async (fromResend = false) => {
    if (!beginSubmit()) return;
    try {
      const source = fromResend
        ? phoneE164 || phoneValidation.e164 || phoneDigits
        : phoneValidation.e164 || phoneDigits;
      if (!fromResend && (!phoneValidation.isComplete || !phoneValidation.e164)) {
        setError(t('auth.phone.errorInvalidInput'));
        return;
      }

      let appVerifier: unknown;
      if (Platform.OS === 'web') {
        try {
          appVerifier = ensureWebRecaptchaVerifier('firebase-recaptcha');
        } catch (err) {
          setError(
            formatPhoneAuthError(
              extractPhoneAuthErrorRaw(err),
              t('auth.phone.errorPrepareFailed'),
            ),
          );
          return;
        }
      }

      const result = await requestOtp(source, { appVerifier });
      if (!result.ok || !result.phoneE164) {
        setError(
          result.ok
            ? t('auth.phone.errorSendFailed')
            : formatPhoneAuthError(result.error),
        );
        return;
      }

      setPhoneE164(result.phoneE164);
      setChannel(result.channel);
      setStep('code');
      setCode('');
      autoVerifyRef.current = '';
      setResendSec(RESEND_COOLDOWN_SEC);
    } catch (err) {
      setError(
        formatPhoneAuthError(
          extractPhoneAuthErrorRaw(err),
          t('auth.phone.errorSendUnexpected'),
        ),
      );
    } finally {
      endSubmit();
    }
  };

  const verifyCode = async (nextCode: string) => {
    const trimmed = sanitizeOtpDigits(nextCode);
    if (!isValidOtpCode(trimmed)) return;
    if (!beginSubmit()) return;
    try {
      const result = await confirmOtp(phoneE164, trimmed, channel);
      if (!result.ok) {
        setError(
          formatPhoneAuthError(
            result.error,
            t('auth.phone.errorCodeInvalid'),
          ),
        );
        autoVerifyRef.current = '';
        return;
      }
      try {
        await onVerified(phoneE164);
      } catch (err) {
        setError(
          formatPhoneAuthError(
            extractPhoneAuthErrorRaw(err),
            t('auth.phone.errorSaveFailed'),
          ),
        );
        autoVerifyRef.current = '';
      }
    } catch (err) {
      autoVerifyRef.current = '';
      setError(
        formatPhoneAuthError(
          extractPhoneAuthErrorRaw(err),
          t('auth.phone.errorVerifyUnexpected'),
        ),
      );
    } finally {
      endSubmit();
    }
  };

  const onChangeCode = (raw: string) => {
    const next = sanitizeOtpDigits(raw);
    setCode(next);
    setError('');
    if (
      next.length === OTP_LEN &&
      autoVerifyRef.current !== next &&
      !submittingRef.current
    ) {
      autoVerifyRef.current = next;
      void verifyCode(next);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={() => {
        if (!required && !submitting) onClose();
      }}
    >
      <View style={styles.root}>
        {required ? (
          <View style={styles.backdrop} />
        ) : (
          <Pressable
            style={styles.backdrop}
            onPress={() => {
              if (!submitting) {
                Keyboard.dismiss();
                onClose();
              }
            }}
          />
        )}
        <KeyboardFormScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="interactive"
          bounces={false}
          showsVerticalScrollIndicator={false}
          bottomGap={Math.max(insets.bottom, 24)}
          keyboardVerticalOffset={
            Platform.OS === 'ios' ? Math.max(insets.top, 8) : 0
          }
        >
          <View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <View style={styles.handle} />
            <Text style={styles.kicker}>{t('auth.phone.kicker')}</Text>
            <Text style={styles.title}>
              {step === 'phone'
                ? t('auth.phone.titlePhone')
                : t('auth.phone.titleCode')}
            </Text>
            <Text style={styles.body}>
              {step === 'phone'
                ? t('auth.phone.bodyPhone')
                : t('auth.phone.bodyCode', {
                    phone: formatPhoneDisplay(phoneE164),
                  })}
            </Text>

            {step === 'phone' ? (
              <PhoneNumberInput
                value={phoneDigits}
                country={phoneCountry}
                onChangeDigits={(digits) => {
                  setPhoneDigits(digits);
                  setError('');
                }}
                onChangeCountry={(next) => {
                  setPhoneCountry(next);
                  setError('');
                }}
                editable={!submitting}
                inputRef={phoneInputRef}
                onSubmitEditing={() => {
                  if (canSend) void sendCode(false);
                }}
              />
            ) : (
              <>
                <Pressable
                  style={styles.otpWrap}
                  onPress={() => codeInputRef.current?.focus()}
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.phone.otpFieldLabel')}
                >
                  {Array.from({ length: OTP_LEN }).map((_, i) => {
                    const char = code[i] ?? '';
                    const active =
                      codeFocused &&
                      (i === code.length ||
                        (code.length === OTP_LEN && i === OTP_LEN - 1));
                    return (
                      <View
                        key={`otp-${i}`}
                        style={[
                          styles.otpCell,
                          active && styles.otpCellActive,
                          char ? styles.otpCellFilled : null,
                        ]}
                      >
                        <Text style={styles.otpDigit}>{char}</Text>
                      </View>
                    );
                  })}
                  <TextInput
                    ref={codeInputRef}
                    style={styles.otpHiddenInput}
                    value={code}
                    onChangeText={onChangeCode}
                    onFocus={() => {
                      setCodeFocused(true);
                      requestAnimationFrame(() => {
                        scrollRef.current?.scrollToEnd(true);
                      });
                    }}
                    onBlur={() => setCodeFocused(false)}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    importantForAutofill="yes"
                    maxLength={OTP_LEN}
                    caretHidden
                    editable={!submitting}
                    accessibilityLabel={t('auth.phone.otpInputLabel')}
                  />
                </Pressable>
                <Text style={styles.otpAssist}>
                  {t('auth.phone.otpAssist')}
                </Text>
              </>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {step === 'phone' ? (
              <Pressable
                style={[
                  styles.submit,
                  (!canSend || submitting) && styles.submitDisabled,
                ]}
                onPress={() => void sendCode(false)}
                disabled={!canSend || submitting}
                accessibilityRole="button"
                accessibilityLabel={t('auth.phone.sendCode')}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitText}>{t('auth.phone.sendCode')}</Text>
                )}
              </Pressable>
            ) : (
              <>
                <Pressable
                  style={[
                    styles.submit,
                    (!canVerify || submitting) && styles.submitDisabled,
                  ]}
                  onPress={() => void verifyCode(code)}
                  disabled={!canVerify || submitting}
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.phone.verify')}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitText}>{t('auth.phone.verifyContinue')}</Text>
                  )}
                </Pressable>

                <View style={styles.codeActions}>
                  <Pressable
                    style={styles.secondary}
                    onPress={() => {
                      if (submitting) return;
                      setStep('phone');
                      setCode('');
                      setError('');
                      autoVerifyRef.current = '';
                    }}
                    disabled={submitting}
                    accessibilityRole="button"
                    accessibilityLabel={t('auth.phone.changeNumberLabel')}
                  >
                    <Text style={styles.secondaryText}>{t('auth.phone.changeNumber')}</Text>
                  </Pressable>

                  <Pressable
                    style={styles.secondary}
                    onPress={() => {
                      if (submitting || resendSec > 0) return;
                      void sendCode(true);
                    }}
                    disabled={submitting || resendSec > 0}
                    accessibilityRole="button"
                    accessibilityLabel={t('auth.phone.resendLabel')}
                  >
                    <Text
                      style={[
                        styles.secondaryText,
                        resendSec > 0 && styles.secondaryMuted,
                      ]}
                    >
                      {resendSec > 0
                        ? t('auth.phone.resendWait', { sec: resendSec })
                        : t('auth.phone.resend')}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {required ? null : (
              <Pressable
                style={styles.guestBtn}
                onPress={() => {
                  if (!submitting) onClose();
                }}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel={t('auth.phone.later')}
              >
                <Text style={styles.guestText}>{t('auth.phone.later')}</Text>
              </Pressable>
            )}

            {Platform.OS === 'web' ? (
              <View
                nativeID="firebase-recaptcha"
                {...({ id: 'firebase-recaptcha' } as object)}
                style={styles.recaptchaSlot}
              />
            ) : null}
          </View>
        </KeyboardFormScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
  },
  scroll: {
    flexGrow: 0,
    maxHeight: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xxl,
    borderTopRightRadius: theme.radius.xxl,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    marginBottom: 14,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.primaryDark,
    letterSpacing: 0.3,
  },
  title: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
  },
  body: {
    marginTop: 8,
    marginBottom: 18,
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.textSecondary,
  },
  otpWrap: {
    position: 'relative',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  otpCell: {
    flex: 1,
    aspectRatio: 0.85,
    maxHeight: 58,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpCellActive: {
    borderColor: theme.colors.primaryDark,
    backgroundColor: theme.colors.primarySoft,
  },
  otpCellFilled: {
    borderColor: theme.colors.primary,
  },
  otpDigit: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
  },
  otpHiddenInput: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.02,
    color: 'transparent',
    fontSize: 1,
  },
  otpAssist: {
    marginBottom: 12,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  error: {
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: theme.colors.danger,
  },
  submit: {
    backgroundColor: theme.colors.primaryDark,
    borderRadius: theme.radius.pill,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: {
    opacity: 0.45,
  },
  submitText: {
    color: theme.colors.onPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  codeActions: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  secondary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  secondaryMuted: {
    color: theme.colors.textMuted,
  },
  guestBtn: {
    marginTop: 2,
    alignItems: 'center',
    paddingVertical: 10,
  },
  guestText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  recaptchaSlot: {
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
});
