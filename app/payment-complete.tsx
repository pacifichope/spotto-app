import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { theme } from '@/constants/theme';
import { confirmCheckoutSession } from '@/lib/stripePayments';

/** Stripe Checkout 完了後の戻り先。セッション確認後にホームへ戻す。 */
export default function PaymentCompleteScreen() {
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

  const [message, setMessage] = useState('決済結果を確認しています…');
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (/cancel/i.test(status)) {
        if (!cancelled) {
          setOk(false);
          setMessage('決済はキャンセルされました。');
        }
        return;
      }
      if (!sessionId) {
        if (!cancelled) {
          setOk(true);
          setMessage('決済が完了しました。アプリに戻って参加状況を確認してください。');
        }
        return;
      }
      try {
        const confirmed = await confirmCheckoutSession(sessionId);
        if (cancelled) return;
        if (confirmed.paid) {
          setOk(true);
          setMessage('お支払いが完了しました。ホームに戻ってイベントを確認できます。');
        } else {
          setOk(false);
          setMessage('決済はまだ完了していないようです。Stripe の画面を確認してください。');
        }
      } catch (error) {
        if (cancelled) return;
        setOk(false);
        setMessage(
          error instanceof Error
            ? error.message
            : '決済の確認に失敗しました。',
        );
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
        {ok == null ? '確認中' : ok ? '決済完了' : '決済未完了'}
      </Text>
      <Text style={styles.message}>{message}</Text>
      <Pressable
        style={styles.btn}
        onPress={() => router.replace('/(tabs)/home')}
        accessibilityRole="button"
        accessibilityLabel="ホームに戻る"
      >
        <Text style={styles.btnText}>ホームに戻る</Text>
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
