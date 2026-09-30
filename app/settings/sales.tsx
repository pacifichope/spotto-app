import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SettingsHeader from '@/components/SettingsHeader';
import { theme } from '@/constants/theme';
import { useAuth } from '@/lib/authContext';
import {
  PAYMENT_FEE_RATE,
  PAYOUT_FEE_YEN,
  PLATFORM_FEE_RATE,
  fetchOrganizerSalesSummary,
  formatSalesYearMonth,
  formatYenAmount,
  payoutStatusLabel,
  salesYearMonthLabel,
  shiftSalesYearMonth,
  subscribeOwnPayoutUpdates,
  type OrganizerSalesSummary,
} from '@/lib/organizerSales';

function currentYearMonth() {
  const now = new Date();
  return formatSalesYearMonth(now.getFullYear(), now.getMonth() + 1);
}

export default function OrganizerSalesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isLoggedIn, openLogin } = useAuth();
  const [yearMonth, setYearMonth] = useState(currentYearMonth);
  const [summary, setSummary] = useState<OrganizerSalesSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const latestYearMonth = currentYearMonth();
  const canGoNext = yearMonth < latestYearMonth;

  const load = useCallback(
    async (isRefresh = false) => {
      if (!isLoggedIn) {
        setSummary(null);
        setLoading(false);
        return;
      }
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      const result = await fetchOrganizerSalesSummary(yearMonth);
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
      if (!result.ok) {
        setError(result.error);
        setSummary(null);
        return;
      }
      setSummary(result.data);
    },
    [isLoggedIn, yearMonth],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isLoggedIn) return;
    return subscribeOwnPayoutUpdates(yearMonth, () => {
      void load(true);
    });
  }, [isLoggedIn, yearMonth, load]);

  if (!isLoggedIn) {
    return (
      <View style={styles.root}>
        <SettingsHeader title="売上管理" />
        <View style={styles.gate}>
          <Text style={styles.gateTitle}>ログインが必要です</Text>
          <Text style={styles.gateBody}>
            主催イベントの売上は、ログイン中のアカウントに紐付いたデータのみ表示されます。
          </Text>
          <Pressable
            style={styles.gateBtn}
            onPress={() => openLogin()}
            accessibilityRole="button"
            accessibilityLabel="ログイン"
          >
            <Text style={styles.gateBtnText}>ログイン</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const status = summary?.payoutStatus ?? 'none';

  return (
    <View style={styles.root}>
      <SettingsHeader title="売上管理" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 28) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={theme.colors.primaryDark}
          />
        }
      >
        <View style={styles.monthBar}>
          <Pressable
            style={styles.monthBtn}
            onPress={() => setYearMonth((ym) => shiftSalesYearMonth(ym, -1))}
            accessibilityRole="button"
            accessibilityLabel="前月"
          >
            <Text style={styles.monthBtnText}>‹</Text>
          </Pressable>
          <View style={styles.monthCenter}>
            <Text style={styles.monthLabel}>
              {summary?.periodLabel || salesYearMonthLabel(yearMonth)}
            </Text>
            <Text style={styles.monthHint}>イベント開催日ベースで集計</Text>
          </View>
          <Pressable
            style={[styles.monthBtn, !canGoNext && styles.monthBtnDisabled]}
            onPress={() => {
              if (!canGoNext) return;
              setYearMonth((ym) => shiftSalesYearMonth(ym, 1));
            }}
            disabled={!canGoNext}
            accessibilityRole="button"
            accessibilityLabel="翌月"
            accessibilityState={{ disabled: !canGoNext }}
          >
            <Text
              style={[
                styles.monthBtnText,
                !canGoNext && styles.monthBtnTextDisabled,
              ]}
            >
              ›
            </Text>
          </Pressable>
        </View>

        {loading && !summary ? (
          <ActivityIndicator
            color={theme.colors.primaryDark}
            style={{ marginTop: 32 }}
          />
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void load()} style={styles.retryBtn}>
              <Text style={styles.retryText}>再読み込み</Text>
            </Pressable>
          </View>
        ) : summary ? (
          <>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusChip,
                  status === 'paid' && styles.statusPaid,
                  status === 'awaiting_payout' && styles.statusAwaiting,
                  status === 'awaiting_event' && styles.statusPending,
                  status === 'none' && styles.statusNone,
                ]}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    status === 'none' && styles.statusChipTextDark,
                  ]}
                >
                  {payoutStatusLabel(status)}
                </Text>
              </View>
            </View>
            {status === 'paid' ? (
              <Text style={styles.statusHint}>
                指定口座へのお振込が完了しています
                {summary.payoutPaidAt
                  ? `（${new Date(summary.payoutPaidAt).toLocaleDateString('ja-JP')}）`
                  : ''}
                。
              </Text>
            ) : status === 'awaiting_payout' ? (
              <Text style={styles.statusHint}>
                終了したイベントの売上は振込待ち（確定）です。翌月末の振込予定をご確認ください。
              </Text>
            ) : status === 'awaiting_event' ? (
              <Text style={styles.statusHint}>
                イベント終了後に自動で「振込待ち（確定）」へ切り替わります。
              </Text>
            ) : (
              <Text style={styles.statusHint}>
                この月のチケット売上はまだありません。
              </Text>
            )}

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>
                {status === 'paid'
                  ? '振込金額（手取り）'
                  : '受取予定額（手取り）'}
              </Text>
              <Text style={styles.summaryNet}>
                {formatYenAmount(summary.netYen)}
              </Text>
              <View style={styles.feeRows}>
                <View style={styles.feeRow}>
                  <Text style={styles.feeKey}>振込対象の売上（終了済み）</Text>
                  <Text style={styles.feeVal}>
                    {formatYenAmount(summary.confirmedGrossYen)}
                  </Text>
                </View>
                {summary.pendingGrossYen > 0 ? (
                  <View style={styles.feeRow}>
                    <Text style={styles.feeKey}>開催待ちの売上（未確定）</Text>
                    <Text style={styles.feeValMuted}>
                      {formatYenAmount(summary.pendingGrossYen)}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.feeRow}>
                  <Text style={styles.feeKey}>
                    決済手数料（約{Math.round(PAYMENT_FEE_RATE * 1000) / 10}%）
                  </Text>
                  <Text style={styles.feeValMuted}>
                    −{formatYenAmount(summary.paymentFeeYen)}
                  </Text>
                </View>
                <View style={styles.feeRow}>
                  <Text style={styles.feeKey}>
                    プラットフォーム利用料（
                    {Math.round(PLATFORM_FEE_RATE * 100)}%）
                  </Text>
                  <Text style={styles.feeValMuted}>
                    −{formatYenAmount(summary.platformFeeYen)}
                  </Text>
                </View>
                <View style={styles.feeRow}>
                  <Text style={styles.feeKey}>
                    振込手数料（一律{PAYOUT_FEE_YEN.toLocaleString('ja-JP')}円）
                  </Text>
                  <Text style={styles.feeValMuted}>
                    −{formatYenAmount(summary.payoutFeeYen)}
                  </Text>
                </View>
              </View>
              <Text style={styles.meta}>
                販売チケット {summary.ticketCount}枚（うち確定{' '}
                {summary.confirmedTicketCount}枚） · イベント{' '}
                {summary.events.length}件
              </Text>
              <Text style={styles.calcNote}>
                手取り = 確定売上 − 決済手数料 − 利用料10% − 振込手数料
                {PAYOUT_FEE_YEN.toLocaleString('ja-JP')}円（月次1回）
              </Text>
            </View>

            <Text style={styles.sectionTitle}>イベント別の内訳</Text>
            <Text style={styles.sectionHint}>
              各イベントの売上は eventId
              ごとに分離して集計しています。決済手数料・利用料はイベント単位、振込手数料は月次合算から控除します。
            </Text>
            {summary.events.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>
                  {salesYearMonthLabel(yearMonth)}の売上はまだありません
                </Text>
                <Text style={styles.emptyBody}>
                  参加者がチケットを決済すると、ここに実績の内訳が表示されます。キャンセル・返金があった分は自動で相殺されます。
                </Text>
              </View>
            ) : (
              <View style={styles.listCard}>
                {summary.events.map((item, index) => (
                  <Pressable
                    key={item.eventId}
                    style={[styles.listRow, index > 0 && styles.listRowBorder]}
                    onPress={() => router.push(`/event/${item.eventId}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.eventTitle}の詳細`}
                  >
                    <View style={styles.listText}>
                      <Text style={styles.listTitle} numberOfLines={2}>
                        {item.eventTitle}
                      </Text>
                      <Text style={styles.listCaption}>
                        {item.eventDate || '日程未設定'} · {item.ticketCount}枚
                        {item.unitPriceYen > 0
                          ? ` × ${formatYenAmount(item.unitPriceYen)}`
                          : ''}
                        {' · '}
                        {item.confirmed ? '振込待ち（確定）' : '開催待ち'}
                      </Text>
                      <Text style={styles.listFeeLine}>
                        売上 {formatYenAmount(item.grossYen)}
                        {' → '}
                        決済手数料 −{formatYenAmount(item.paymentFeeYen)}
                        {' → '}
                        利用料 −{formatYenAmount(item.platformFeeYen)}
                        {' → '}
                        主催者分 {formatYenAmount(item.netAfterPlatformYen)}
                      </Text>
                    </View>
                    <View style={styles.listAmountCol}>
                      <Text style={styles.listAmount}>
                        {formatYenAmount(item.grossYen)}
                      </Text>
                      <Text style={styles.listAmountSub}>
                        純額 {formatYenAmount(item.netAfterPlatformYen)}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={styles.links}>
              <Pressable
                style={styles.linkRow}
                onPress={() => router.push('/settings/bank-account')}
                accessibilityRole="button"
                accessibilityLabel="振込口座へ"
              >
                <Text style={styles.linkLabel}>振込口座を確認・登録</Text>
                <Text style={styles.linkChevron}>›</Text>
              </Pressable>
              <Pressable
                style={[styles.linkRow, styles.linkRowBorder]}
                onPress={() => router.push('/settings/organizer-guidelines')}
                accessibilityRole="button"
                accessibilityLabel="主催者ガイドラインへ"
              >
                <Text style={styles.linkLabel}>手数料・振込の説明</Text>
                <Text style={styles.linkChevron}>›</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {loading && summary ? (
          <ActivityIndicator
            color={theme.colors.primaryDark}
            style={{ marginTop: 8 }}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 14,
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  monthBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthBtnDisabled: {
    opacity: 0.35,
  },
  monthBtnText: {
    fontSize: 28,
    color: theme.colors.primaryDark,
    lineHeight: 32,
  },
  monthBtnTextDisabled: {
    color: theme.colors.textMuted,
  },
  monthCenter: {
    flex: 1,
    alignItems: 'center',
  },
  monthLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
  },
  monthHint: {
    marginTop: 2,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusPaid: {
    backgroundColor: '#047857',
  },
  statusAwaiting: {
    backgroundColor: '#B45309',
  },
  statusPending: {
    backgroundColor: '#64748B',
  },
  statusNone: {
    backgroundColor: theme.colors.border,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  statusChipTextDark: {
    color: theme.colors.textSecondary,
  },
  statusHint: {
    marginTop: -6,
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.textMuted,
  },
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 10,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  summaryNet: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.text,
  },
  feeRows: {
    gap: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  feeKey: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  feeVal: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text,
  },
  feeValMuted: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  meta: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  calcNote: {
    fontSize: 11,
    lineHeight: 16,
    color: theme.colors.textMuted,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text,
  },
  sectionHint: {
    marginTop: -6,
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.textMuted,
  },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 18,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.colors.textMuted,
  },
  listCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  listRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  listText: {
    flex: 1,
    gap: 4,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  listCaption: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  listFeeLine: {
    fontSize: 11,
    lineHeight: 16,
    color: theme.colors.textSecondary,
  },
  listAmountCol: {
    alignItems: 'flex-end',
    gap: 2,
    paddingTop: 2,
  },
  listAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.text,
  },
  listAmountSub: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  links: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  linkRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  linkLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  linkChevron: {
    fontSize: 20,
    color: theme.colors.textMuted,
  },
  errorCard: {
    marginTop: 8,
    padding: 16,
    gap: 12,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#B45309',
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.primaryDark,
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
  },
  gate: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 12,
  },
  gateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
  },
  gateBody: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  gateBtn: {
    marginTop: 8,
    alignSelf: 'center',
    backgroundColor: theme.colors.primaryDark,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  gateBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
