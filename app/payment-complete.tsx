import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { theme } from '@/constants/theme';
import { confirmCheckoutSession } from '@/lib/stripePayments';

/** Stripe Checkout 完了後の戻り先。セッション確認後にホームへ戻す。 */
export default function PaymentCompleteScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    status?: string | string[];
    session_id?: string | string[];
  }>();
  const status = useMemo(() => {
    const raw = params.status;
    return String(Array.isArray(raw) ? raw[0] : raw || '');
  }, [params.status]);
  const sessionId = useMemo(() => {
    const raw = params.session_id;
    return String(Array.isArray(raw) ? raw[0] : raw || '');
  }, [params.session_id]);

  const [messageKey, setMessageKey] = useState('payment.complete.checkingMessage');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (/cancel/i.test(status)) {
        if (!cancelled) {
          setOk(false);
          setMessageKey('payment.complete.cancelledMessage');
        }
        return;
      }
      if (!sessionId) {
        if (!cancelled) {
          setOk(true);
          setMessageKey('payment.complete.noSessionMessage');
        }
        return;
      }
      try {
        const confirmed = await confirmCheckoutSession(sessionId);
        if (cancelled) return;
        if (confirmed.paid) {
          setOk(true);
          setMessageKey('payment.complete.paidMessage');
        } else {
          setOk(false);
          setMessageKey('payment.complete.unpaidMessage');
        }
      } catch (error) {
        if (cancelled) return;
        setOk(false);
        if (error instanceof Error && error.message) {
          setErrorText(error.message);
        } else {
          setErrorText(null);
          setMessageKey('payment.complete.confirmFailedMessage');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, status]);

  return (
    <View style={styles.root}>
      {ok == null ? (
        <ActivityIndicator color={theme.colors.primaryDark} size="large" />
      ) : null}
      <Text style={styles.title}>
        {ok == null
          ? t('payment.complete.checkingTitle')
          : ok
            ? t('payment.complete.doneTitle')
            : t('payment.complete.notDoneTitle')}
      </Text>
      <Text style={styles.message}>{errorText ?? t(messageKey)}</Text>
      <Pressable
        style={styles.btn}
        onPress={() => router.replace('/(tabs)/home')}
        accessibilityRole="button"
        accessibilityLabel={t('common.backToHome')}
      >
        <Text style={styles.btnText}>{t('common.backToHome')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 28,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.text,
  },
  message: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  btn: {
    marginTop: 8,
    backgroundColor: theme.colors.primaryDark,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  btnText: {
    color: theme.colors.onPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
});
