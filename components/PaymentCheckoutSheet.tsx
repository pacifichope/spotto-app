import AppModal from '@/components/AppModal';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';
import i18n from '@/lib/i18n';
import {
  buildRefundPolicyRows,
  cancelPolicyCardText,
  eventEarliestStartAt,
  eventPreviewUris,
  eventSpotsLeft,
  formatEventSchedule,
  formatLocationLabel,
  formatRefundDeadline,
  parseCancelPolicyRule,
  type EventSession,
  type SportEvent,
} from '@/lib/events';
import { localizedEventTitle } from '@/lib/eventLocalizedText';
import { formatYenAmount, isPaidEvent } from '@/lib/payments';
import {
  sanitizePreQuestions,
  type PreQuestion,
} from '@/lib/preQuestions';
import {
  confirmCheckoutSession,
  confirmPaymentIntentStatus,
  createPaymentSession,
  demoPaymentIntentId,
  isStripePaymentsConfigured,
  isStripeTestMode,
  openHostedCheckout,
  paymentIntentIdFromSession,
} from '@/lib/stripePayments';
import {
  isNativeStripeAvailable,
  presentNativePaymentSheet,
} from '@/lib/stripeNative';

export type JoinCheckoutAnswers = Record<string, string | string[]>;

export type JoinCheckoutResult = {
  mode: 'paid' | 'free';
  paymentIntentId?: string;
  quantity: number;
  amountYen: number;
  answers: JoinCheckoutAnswers;
};

type PaymentCheckoutSheetProps = {
  visible: boolean;
  event: SportEvent | null;
  /** ユーザーが選んだ単一開催日時（未指定時は event の先頭日程） */
  selectedSession?: EventSession | null;
  /** 1枚あたりの参加費（円）。0 なら無料参加 */
  amountYen: number;
  onClose: () => void;
  onConfirm: (result: JoinCheckoutResult) => void;
};

type PaymentMethodId = 'stripe' | 'apple_demo' | 'card_demo';

const ACCENT_GREEN = '#29D1E8';
const CTA_BLACK = '#111111';
const TABLE_BORDER = '#D6E8F5';
const TABLE_HEADER_BG = '#EAF4FB';
const SECTION_BG = '#F7FBFC';
const MUTED = '#8A9199';
const PRICE_RED = '#E11D48';

function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

function formatCardNumber(value: string) {
  return digitsOnly(value)
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, '$1 ')
    .trim();
}

function formatExpiry(value: string) {
  const digits = digitsOnly(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function activeQuestions(event: SportEvent | null): PreQuestion[] {
  if (!event?.enablePreQuestions) return [];
  return sanitizePreQuestions(event.preQuestions ?? []);
}

function emptyAnswers(questions: PreQuestion[]): JoinCheckoutAnswers {
  const next: JoinCheckoutAnswers = {};
  for (const q of questions) {
    next[q.id] = q.type === 'multi' ? [] : '';
  }
  return next;
}

function validateAnswers(
  questions: PreQuestion[],
  answers: JoinCheckoutAnswers,
): string | null {
  for (const q of questions) {
    if (!q.required) continue;
    const value = answers[q.id];
    if (q.type === 'multi') {
      if (!Array.isArray(value) || value.length === 0) {
        return i18n.t('payment.answerRequired', { title: q.title });
      }
    } else if (typeof value !== 'string' || !value.trim()) {
      return i18n.t('payment.answerRequired', { title: q.title });
    }
  }
  return null;
}

export default function PaymentCheckoutSheet({
  visible,
  event,
  selectedSession = null,
  amountYen,
  onClose,
  onConfirm,
}: PaymentCheckoutSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const paid = isPaidEvent({ priceYen: amountYen });
  const questions = useMemo(() => activeQuestions(event), [event]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [answers, setAnswers] = useState<JoinCheckoutAnswers>({});
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethodId>('stripe');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');

  const stripeReady = isStripePaymentsConfigured();
  const showDevHints = __DEV__ && isStripeTestMode();
  /** 決済セッション取得〜 Stripe UI 表示中 */
  const [preparingPay, setPreparingPay] = useState(false);
  /**
   * iOS: RN Modal の上から PaymentSheet を present するとシートが
   * 見えない／背面に残るため、present 直前だけ Modal を外す。
   */
  const [suspendModalForNativePay, setSuspendModalForNativePay] =
    useState(false);
  const unitYen = Math.max(0, Math.floor(amountYen));
  const totalYen = unitYen * quantity;
  const spotsLeft = event ? eventSpotsLeft(event) : 1;
  const maxQty = Math.max(1, spotsLeft);
  const thumb = event ? eventPreviewUris(event, 1)[0] : undefined;
  const schedule = event
    ? formatEventSchedule(event, selectedSession)
    : null;
  const policyLabel = event ? cancelPolicyCardText(event) : '';
  const refundable =
    event && paid
      ? parseCancelPolicyRule(event.cancelPolicy).kind !== 'none'
      : false;
  const eventForTiming = useMemo(() => {
    if (!event) return null;
    if (!selectedSession) return event;
    return {
      ...event,
      date: selectedSession.date,
      time: selectedSession.time,
      endDate: selectedSession.endDate,
      endTime: selectedSession.endTime,
      sessions: undefined,
    };
  }, [event, selectedSession]);
  const eventStartLabel = eventForTiming
    ? formatRefundDeadline(eventEarliestStartAt(eventForTiming))
    : '';
  const refundRows = useMemo(() => {
    if (!eventForTiming || !paid) return [];
    return buildRefundPolicyRows(eventForTiming, totalYen);
  }, [
    eventForTiming,
    paid,
    totalYen,
    selectedSession?.date,
    selectedSession?.time,
    event?.cancelPolicy,
    t,
  ]);
  const payInFlightRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      setPreparingPay(false);
      setBusy(false);
      setSuspendModalForNativePay(false);
      payInFlightRef.current = false;
      return;
    }
    if (!event) return;
    setBusy(false);
    setError('');
    setPreparingPay(false);
    setSuspendModalForNativePay(false);
    payInFlightRef.current = false;
    const initialMax = Math.max(1, eventSpotsLeft(event));
    setQuantity(Math.min(1, initialMax));
    setAnswers(emptyAnswers(activeQuestions(event)));
    setPaymentMethod(stripeReady ? 'stripe' : 'apple_demo');
    setCardNumber('');
    setExpiry('');
    setCvc('');
    if (__DEV__) {
      console.log('[payments] checkout sheet open', {
        eventId: event.id,
        amountYen,
        stripeReady,
        platform: Platform.OS,
      });
    }
  }, [visible, event?.id, stripeReady, amountYen]);

  useEffect(() => {
    if (quantity > maxQty) setQuantity(maxQty);
  }, [maxQty, quantity]);

  const showPayError = (message: string) => {
    setError(message);
    setBusy(false);
    setPreparingPay(false);
    setSuspendModalForNativePay(false);
    payInFlightRef.current = false;
    Alert.alert(t('payment.cannotStartTitle'), message);
  };

  const resetAndClose = () => {
    if (busy || preparingPay || payInFlightRef.current) return;
    Keyboard.dismiss();
    onClose();
  };

  const setTextAnswer = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const toggleMultiOption = (id: string, option: string) => {
    setAnswers((prev) => {
      const current = Array.isArray(prev[id]) ? [...(prev[id] as string[])] : [];
      const index = current.indexOf(option);
      if (index >= 0) current.splice(index, 1);
      else current.push(option);
      return { ...prev, [id]: current };
    });
  };

  const setSingleOption = (id: string, option: string) => {
    setAnswers((prev) => ({ ...prev, [id]: option }));
  };

  const finishConfirm = (paymentIntentId?: string) => {
    setBusy(false);
    setError('');
    setPreparingPay(false);
    payInFlightRef.current = false;
    onConfirm({
      mode: paid ? 'paid' : 'free',
      paymentIntentId,
      quantity,
      amountYen: totalYen,
      answers,
    });
  };

  /** Android / フォールバック: Hosted Checkout を開く */
  const payViaHostedCheckout = async () => {
    if (!event) return false;
    const hosted = await createPaymentSession({
      eventId: event.id,
      title: event.title,
      amountYen: totalYen,
      preferHostedCheckout: true,
    });
    if (!hosted?.checkoutUrl) {
      showPayError(
        t('payment.errorPrepareFailed'),
      );
      return false;
    }
    setPreparingPay(false);
    const result = await openHostedCheckout(hosted.checkoutUrl);
    if (__DEV__) {
      console.log('[payments] hosted checkout result', result);
    }
    if (!result.paid) {
      setBusy(false);
      return false;
    }
    const sessionId = result.sessionId || hosted.checkoutSessionId || '';
    if (!sessionId) {
      showPayError(
        t('payment.errorConfirmInfoFailed'),
      );
      return false;
    }
    setPreparingPay(true);
    const confirmed = await confirmCheckoutSession(sessionId);
    if (!confirmed.paid || !confirmed.paymentIntentId) {
      showPayError(
        t('payment.errorCompletionFailed'),
      );
      return false;
    }
    finishConfirm(confirmed.paymentIntentId);
    return true;
  };

  const payViaStripe = async () => {
    if (!event || payInFlightRef.current) return;
    payInFlightRef.current = true;
    setBusy(true);
    setError('');
    setPreparingPay(true);
    Keyboard.dismiss();
    // Android は PaymentSheet（ネイティブ）を優先。Web のみ Hosted を先に使う。
    const preferHosted = Platform.OS === 'web';
    if (__DEV__) {
      console.log('[payments] payViaStripe start', {
        eventId: event.id,
        totalYen,
        platform: Platform.OS,
        preferHosted,
        stripeReady,
      });
    }
    try {
      if (preferHosted) {
        await payViaHostedCheckout();
        return;
      }

      const session = await createPaymentSession({
        eventId: event.id,
        title: event.title,
        amountYen: totalYen,
        preferHostedCheckout: false,
      });
      if (!session?.clientSecret?.trim()) {
        if (__DEV__) {
          console.warn('[payments] no clientSecret, falling back to hosted');
        }
        await payViaHostedCheckout();
        return;
      }

      if (!isNativeStripeAvailable()) {
        await payViaHostedCheckout();
        return;
      }

      if (__DEV__) {
        console.log('[payments] presenting native PaymentSheet', {
          paymentIntentId: session.paymentIntentId,
          platform: Platform.OS,
        });
      }

      // iOS: Modal を外してから PaymentSheet を出す（Modal 上 present だと非表示になる）
      if (Platform.OS === 'ios') {
        setSuspendModalForNativePay(true);
        await new Promise((resolve) => setTimeout(resolve, 320));
      } else {
        await new Promise((resolve) => setTimeout(resolve, 80));
      }

      let paidOk = false;
      try {
        paidOk = await presentNativePaymentSheet(session);
      } catch (nativeErr) {
        if (__DEV__) {
          console.error('[payments] PaymentSheet failed, try hosted', nativeErr);
        }
        setSuspendModalForNativePay(false);
        await payViaHostedCheckout();
        return;
      }

      if (paidOk) {
        const paymentIntentId =
          paymentIntentIdFromSession(session) || demoPaymentIntentId(event.id);
        const confirmed = await confirmPaymentIntentStatus(paymentIntentId);
        if (!confirmed.paid) {
          setSuspendModalForNativePay(false);
          showPayError(
            confirmed.status
              ? t('payment.errorNotCompletedStatus', { status: confirmed.status })
              : t('payment.errorNotCompleted'),
          );
          return;
        }
        finishConfirm(confirmed.paymentIntentId || paymentIntentId);
        return;
      }

      // ユーザーキャンセル → チェックアウト Modal を戻す
      setSuspendModalForNativePay(false);
      setBusy(false);
      setPreparingPay(false);
      payInFlightRef.current = false;
    } catch (err) {
      setSuspendModalForNativePay(false);
      const message =
        err instanceof Error ? err.message : t('payment.errorStartFailed');
      if (__DEV__) console.error('[payments] payViaStripe failed', err);
      showPayError(message);
    }
  };

  const payDemo = async (method: 'apple' | 'card') => {
    if (!event) return;
    if (method === 'card') {
      const number = digitsOnly(cardNumber);
      if (number.length < 13 || expiry.length < 4 || digitsOnly(cvc).length < 3) {
        setError(t('payment.errorCardIncomplete'));
        return;
      }
    }
    setBusy(true);
    setError('');
    await new Promise((resolve) => setTimeout(resolve, 700));
    finishConfirm(demoPaymentIntentId(event.id));
  };

  const handleConfirm = () => {
    if (!event || busy || preparingPay || payInFlightRef.current) return;
    if (quantity > maxQty) {
      setError(t('payment.errorMaxQty', { count: maxQty }));
      return;
    }
    const answerError = validateAnswers(questions, answers);
    if (answerError) {
      setError(answerError);
      return;
    }
    setError('');

    if (!paid) {
      setBusy(true);
      finishConfirm();
      return;
    }

    if (stripeReady && paymentMethod === 'stripe') {
      void payViaStripe();
      return;
    }
    if (!stripeReady) {
      showPayError(
        t('payment.errorStripeNotConfigured'),
      );
      return;
    }
    if (paymentMethod === 'apple_demo') {
      void payDemo('apple');
      return;
    }
    void payDemo('card');
  };

  if (!visible || !event) return null;

  // Modal を外しているあいだは Stripe ネイティブシートに前面を譲る
  if (suspendModalForNativePay) {
    return null;
  }

  const ctaLabel = paid
    ? t('payment.ctaPay', { amount: formatYenAmount(totalYen) })
    : t('payment.ctaConfirm');
  const payBlocked = busy || preparingPay;

  const sheetBody = (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top || 8, backgroundColor: '#FFFFFF' },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={resetAndClose}
          disabled={payBlocked}
          hitSlop={12}
          style={styles.headerSide}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t('payment.title')}</Text>
        <View style={styles.headerSide} />
      </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 88 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          {/* イベント概要 */}
          <View style={styles.eventRow}>
            {thumb ? (
              <Image source={{ uri: thumb }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback]}>
                <Text style={styles.thumbEmoji}>{event.emoji || '🏅'}</Text>
              </View>
            )}
            <View style={styles.eventMeta}>
              <Text style={styles.eventTitle} numberOfLines={2}>
                {localizedEventTitle(event)}
              </Text>
              {schedule ? (
                <Text style={styles.eventSchedule} numberOfLines={2}>
                  {schedule.full}
                </Text>
              ) : null}
              <Text style={styles.eventLocation} numberOfLines={2}>
                {formatLocationLabel(event.location, event.locationNote)}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* 枚数・金額 */}
          <View style={styles.rowBetween}>
            <View style={styles.rowLabelCol}>
              <Text style={styles.rowLabel}>{t('payment.ticketQuantity')}</Text>
              <Text style={styles.rowHint}>
                {t('payment.spotsSelectable', { count: spotsLeft })}
              </Text>
            </View>
            <View style={styles.stepper}>
              <Pressable
                style={[
                  styles.stepBtn,
                  quantity <= 1 && styles.stepBtnDisabled,
                ]}
                disabled={quantity <= 1 || busy}
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                accessibilityLabel={t('payment.decreaseQty')}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </Pressable>
              <Text style={styles.stepValue}>{quantity}</Text>
              <Pressable
                style={[
                  styles.stepBtn,
                  quantity >= maxQty && styles.stepBtnDisabled,
                ]}
                disabled={quantity >= maxQty || busy}
                onPress={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                accessibilityLabel={t('payment.increaseQty')}
              >
                <Text style={styles.stepBtnText}>＋</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.rowBetween}>
            <View style={styles.rowLabelCol}>
              <Text style={styles.rowLabel}>{t('payment.amountLabel')}</Text>
              {paid && quantity > 1 ? (
                <Text style={styles.rowHint}>
                  {t('payment.unitTimesQty', {
                    unit: formatYenAmount(unitYen),
                    count: quantity,
                  })}
                </Text>
              ) : paid ? (
                <Text style={styles.rowHint}>
                  {t('payment.perTicket', { amount: formatYenAmount(unitYen) })}
                </Text>
              ) : null}
            </View>
            <Text style={[styles.amountValue, paid && styles.amountPaid]}>
              {paid ? formatYenAmount(totalYen) : t('events.free')}
            </Text>
          </View>

          <View style={styles.divider} />

          {/* 支払い方法（有料のみ） */}
          {paid ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('payment.methodTitle')}</Text>
              {stripeReady ? (
                <Pressable
                  style={[
                    styles.payMethod,
                    paymentMethod === 'stripe' && styles.payMethodActive,
                  ]}
                  onPress={() => setPaymentMethod('stripe')}
                >
                  <Text style={styles.payMethodLabel}>{t('payment.methodStripe')}</Text>
                  <View
                    style={[
                      styles.check,
                      paymentMethod === 'stripe' && styles.checkOn,
                    ]}
                  >
                    {paymentMethod === 'stripe' ? (
                      <Text style={styles.checkMark}>✓</Text>
                    ) : null}
                  </View>
                </Pressable>
              ) : (
                <>
                  <Pressable
                    style={[
                      styles.payMethod,
                      paymentMethod === 'apple_demo' && styles.payMethodActive,
                    ]}
                    onPress={() => setPaymentMethod('apple_demo')}
                  >
                    <Text style={styles.payMethodLabel}>Apple Pay</Text>
                    <View
                      style={[
                        styles.check,
                        paymentMethod === 'apple_demo' && styles.checkOn,
                      ]}
                    >
                      {paymentMethod === 'apple_demo' ? (
                        <Text style={styles.checkMark}>✓</Text>
                      ) : null}
                    </View>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.payMethod,
                      paymentMethod === 'card_demo' && styles.payMethodActive,
                    ]}
                    onPress={() => setPaymentMethod('card_demo')}
                  >
                    <Text style={styles.payMethodLabel}>{t('payment.methodCard')}</Text>
                    <View
                      style={[
                        styles.check,
                        paymentMethod === 'card_demo' && styles.checkOn,
                      ]}
                    >
                      {paymentMethod === 'card_demo' ? (
                        <Text style={styles.checkMark}>✓</Text>
                      ) : null}
                    </View>
                  </Pressable>
                  {paymentMethod === 'card_demo' ? (
                    <View style={styles.cardFields}>
                      <TextInput
                        style={styles.input}
                        value={cardNumber}
                        onChangeText={(value) =>
                          setCardNumber(formatCardNumber(value))
                        }
                        placeholder={t('payment.cardNumber')}
                        placeholderTextColor={MUTED}
                        keyboardType="number-pad"
                        maxLength={19}
                      />
                      <View style={styles.cardRow}>
                        <TextInput
                          style={[styles.input, styles.cardHalf]}
                          value={expiry}
                          onChangeText={(value) =>
                            setExpiry(formatExpiry(value))
                          }
                          placeholder="MM/YY"
                          placeholderTextColor={MUTED}
                          keyboardType="number-pad"
                          maxLength={5}
                        />
                        <TextInput
                          style={[styles.input, styles.cardHalf]}
                          value={cvc}
                          onChangeText={(value) =>
                            setCvc(digitsOnly(value).slice(0, 4))
                          }
                          placeholder="CVC"
                          placeholderTextColor={MUTED}
                          keyboardType="number-pad"
                          maxLength={4}
                          secureTextEntry
                        />
                      </View>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          {/* 事前質問 */}
          {questions.length > 0 ? (
            <View style={[styles.section, styles.sectionTint]}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>
                  {t('payment.questionsTitle', { count: questions.length })}
                </Text>
              </View>
              <Text style={styles.sectionHint}>
                {t('payment.questionsHint')}
              </Text>
              {questions.map((q) => (
                <View key={q.id} style={styles.questionBlock}>
                  <Text style={styles.questionTitle}>
                    {q.title}
                    {q.required ? (
                      <Text style={styles.requiredMark}> ＊</Text>
                    ) : (
                      <Text style={styles.optionalMark}>{t('payment.optionalMark')}</Text>
                    )}
                  </Text>
                  {q.type === 'text' ? (
                    <TextInput
                      style={styles.input}
                      value={
                        typeof answers[q.id] === 'string'
                          ? (answers[q.id] as string)
                          : ''
                      }
                      onChangeText={(value) => setTextAnswer(q.id, value)}
                      placeholder={t('payment.answerPlaceholder')}
                      placeholderTextColor={MUTED}
                    />
                  ) : null}
                  {q.type === 'single'
                    ? q.options.map((option) => {
                        const selected = answers[q.id] === option;
                        return (
                          <Pressable
                            key={option}
                            style={[
                              styles.optionRow,
                              selected && styles.optionRowOn,
                            ]}
                            onPress={() => setSingleOption(q.id, option)}
                          >
                            <View
                              style={[
                                styles.radio,
                                selected && styles.radioOn,
                              ]}
                            />
                            <Text style={styles.optionText}>{option}</Text>
                          </Pressable>
                        );
                      })
                    : null}
                  {q.type === 'multi'
                    ? q.options.map((option) => {
                        const selected =
                          Array.isArray(answers[q.id]) &&
                          (answers[q.id] as string[]).includes(option);
                        return (
                          <Pressable
                            key={option}
                            style={[
                              styles.optionRow,
                              selected && styles.optionRowOn,
                            ]}
                            onPress={() => toggleMultiOption(q.id, option)}
                          >
                            <View
                              style={[
                                styles.checkbox,
                                selected && styles.checkboxOn,
                              ]}
                            >
                              {selected ? (
                                <Text style={styles.checkMark}>✓</Text>
                              ) : null}
                            </View>
                            <Text style={styles.optionText}>{option}</Text>
                          </Pressable>
                        );
                      })
                    : null}
                </View>
              ))}
            </View>
          ) : null}

          {/* 返金ポリシー表（主催者設定 × 開催日時 × 合計金額で動的算出） */}
          {paid ? (
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>{t('payment.policyTitle')}</Text>
                <View
                  style={[
                    styles.badge,
                    !refundable && styles.badgeMuted,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      !refundable && styles.badgeTextMuted,
                    ]}
                  >
                    {refundable ? t('payment.autoRefund') : t('payment.noRefund')}
                  </Text>
                </View>
              </View>
              {policyLabel ? (
                <Text style={styles.policySummary}>{policyLabel}</Text>
              ) : null}
              {eventStartLabel ? (
                <Text style={styles.sectionHint}>
                  {t('payment.deadlineBasis', { when: eventStartLabel })}
                </Text>
              ) : null}
              <Text style={styles.sectionHint}>
                {refundable
                  ? t('payment.refundableNote')
                  : t('payment.nonRefundableNote')}
              </Text>
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                  <Text
                    style={[
                      styles.tableCell,
                      styles.tableCellWide,
                      styles.tableHeaderText,
                      styles.tableCellBorder,
                    ]}
                  >
                    {t('payment.tableDeadline')}
                  </Text>
                  <Text
                    style={[
                      styles.tableCell,
                      styles.tableHeaderText,
                      styles.tableCellBorder,
                    ]}
                  >
                    {t('payment.tableRate')}
                  </Text>
                  <Text style={[styles.tableCell, styles.tableHeaderText]}>
                    {t('payment.tableAmount')}
                  </Text>
                </View>
                {refundRows.map((row, index) => (
                  <View
                    key={`${row.refundRatePercent}-${index}-${row.refundAmountYen}-${row.requestTimeLabel}`}
                    style={[
                      styles.tableRow,
                      index % 2 === 1 && styles.tableRowAlt,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tableCell,
                        styles.tableCellWide,
                        styles.tableCellBorder,
                      ]}
                    >
                      {row.requestTimeLabel}
                    </Text>
                    <Text
                      style={[
                        styles.tableCell,
                        styles.tableCellBorder,
                        styles.tableCellStrong,
                      ]}
                    >
                      {row.refundRateLabel}
                    </Text>
                    <Text style={[styles.tableCell, styles.tableCellStrong]}>
                      {formatYenAmount(row.refundAmountYen)}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={styles.tableFootnote}>
                {t('payment.tableFootnote', {
                  total: formatYenAmount(totalYen),
                  detail:
                    quantity > 1
                      ? t('payment.tableFootnoteDetail', {
                          unit: formatYenAmount(unitYen),
                          count: quantity,
                        })
                      : '',
                })}
              </Text>
            </View>
          ) : null}

          {/* 免責 */}
          <View style={styles.section}>
            <View style={styles.disclaimerHeader}>
              <View style={styles.disclaimerIcon}>
                <Text style={styles.disclaimerIconText}>!</Text>
              </View>
              <Text style={styles.sectionTitle}>{t('payment.disclaimerTitle')}</Text>
            </View>
            <Text style={styles.disclaimerText}>
              {[
                t('payment.disclaimer1'),
                t('payment.disclaimer2'),
                t('payment.disclaimer3'),
                t('payment.disclaimer4'),
              ]
                .map((line) => `• ${line}`)
                .join('\n')}
            </Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {showDevHints ? (
            <Text style={styles.devHint}>
              {t('payment.devHint')}
            </Text>
          ) : null}

          <View style={{ height: 24 }} />
        </ScrollView>

        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <Pressable
            style={[styles.cta, payBlocked && styles.ctaDisabled]}
            onPress={handleConfirm}
            disabled={payBlocked}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
          >
            {payBlocked ? (
              <ActivityIndicator color={ACCENT_GREEN} />
            ) : (
              <Text style={styles.ctaText}>{ctaLabel}</Text>
            )}
          </Pressable>
        </View>

        {preparingPay ? (
          <View style={styles.preparingOverlay} pointerEvents="auto">
            <View style={styles.preparingCard}>
              <ActivityIndicator size="large" color={ACCENT_GREEN} />
              <Text style={styles.preparingTitle}>{t('payment.preparingTitle')}</Text>
              <Text style={styles.preparingBody}>
                {t('payment.preparingBody')}
              </Text>
            </View>
          </View>
        ) : null}
    </View>
  );

  // Android では Modal の方が確実に全面表示される（絶対配置オーバーレイだと
  // 端末によっては見えない / 背面に残るケースがある）
  return (
    <AppModal
      visible={visible}
      animationType="slide"
      transparent={false}
      presentationStyle={Platform.OS === 'ios' ? 'fullScreen' : undefined}
      statusBarTranslucent={Platform.OS === 'android'}
      hardwareAccelerated
      onRequestClose={resetAndClose}
    >
      {sheetBody}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  preparingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 20,
  },
  preparingCard: {
    alignItems: 'center',
    paddingHorizontal: 28,
    gap: 10,
  },
  preparingTitle: {
    marginTop: 8,
    fontSize: 17,
    fontWeight: '800',
    color: '#111111',
  },
  preparingBody: {
    fontSize: 14,
    fontWeight: '600',
    color: MUTED,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  headerSide: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backChevron: {
    fontSize: 32,
    lineHeight: 34,
    color: theme.colors.text,
    fontWeight: '300',
    marginTop: -2,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  eventRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceAlt,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbEmoji: {
    fontSize: 28,
  },
  eventMeta: {
    flex: 1,
    minWidth: 0,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    lineHeight: 22,
  },
  eventSchedule: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  eventLocation: {
    marginTop: 4,
    fontSize: 13,
    color: MUTED,
    lineHeight: 18,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginVertical: 16,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 12,
  },
  rowLabelCol: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  rowHint: {
    marginTop: 3,
    fontSize: 12,
    color: MUTED,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: {
    opacity: 0.4,
  },
  stepBtnText: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
    lineHeight: 22,
  },
  stepValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  amountValue: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.text,
  },
  amountPaid: {
    color: PRICE_RED,
  },
  section: {
    marginBottom: 20,
  },
  sectionTint: {
    backgroundColor: SECTION_BG,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: -4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text,
  },
  sectionHint: {
    fontSize: 12,
    lineHeight: 18,
    color: MUTED,
    marginBottom: 12,
  },
  policySummary: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 6,
  },
  badge: {
    backgroundColor: '#E5F9FC',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeMuted: {
    backgroundColor: '#EEF1F4',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.primaryDark,
  },
  badgeTextMuted: {
    color: theme.colors.textSecondary,
  },
  tableFootnote: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 16,
    color: MUTED,
  },
  payMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 8,
    backgroundColor: '#FFF',
  },
  payMethodActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  payMethodLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#C5CDD3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checkMark: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  cardFields: {
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
    color: theme.colors.text,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cardHalf: {
    flex: 1,
  },
  questionBlock: {
    marginBottom: 14,
  },
  questionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  requiredMark: {
    color: PRICE_RED,
    fontWeight: '800',
  },
  optionalMark: {
    color: MUTED,
    fontWeight: '500',
    fontSize: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 6,
  },
  optionRowOn: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#C5CDD3',
  },
  radioOn: {
    borderColor: theme.colors.primary,
    borderWidth: 5,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#C5CDD3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
  },
  table: {
    borderWidth: 1,
    borderColor: TABLE_BORDER,
    borderRadius: 10,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: TABLE_BORDER,
    backgroundColor: '#FFF',
  },
  tableRowAlt: {
    backgroundColor: '#F8FCFF',
  },
  tableHeader: {
    backgroundColor: TABLE_HEADER_BG,
    borderTopWidth: 0,
  },
  tableCell: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.text,
    textAlign: 'center',
  },
  tableCellWide: {
    flex: 1.55,
    textAlign: 'left',
  },
  tableCellBorder: {
    borderRightWidth: 1,
    borderRightColor: TABLE_BORDER,
  },
  tableCellStrong: {
    fontWeight: '700',
  },
  tableHeaderText: {
    fontWeight: '800',
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  disclaimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  disclaimerIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disclaimerIconText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 13,
  },
  disclaimerText: {
    fontSize: 12,
    lineHeight: 19,
    color: MUTED,
  },
  error: {
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.danger,
    fontWeight: '600',
  },
  devHint: {
    fontSize: 11,
    color: MUTED,
    marginBottom: 8,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: '#FFF',
  },
  cta: {
    backgroundColor: CTA_BLACK,
    borderRadius: 999,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  ctaDisabled: {
    opacity: 0.65,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '800',
    color: ACCENT_GREEN,
    letterSpacing: 0.2,
  },
});
