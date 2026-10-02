import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  parseSalesYearMonth,
  shiftSalesYearMonth,
  subscribeOwnPayoutUpdates,
  type MonthPayoutDisplayStatus,
  type OrganizerSalesSummary,
} from '@/lib/organizerSales';

function currentYearMonth() {
  const now = new Date();
  return formatSalesYearMonth(now.getFullYear(), now.getMonth() + 1);
}

export default function OrganizerSalesScreen() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'en' ? 'en-US' : 'ja-JP';
  const monthLabel = (ym: string) => {
    const parsed = parseSalesYearMonth(ym);
    return parsed ? t('sales.monthLabel', parsed) : ym;
  };
  const statusLabel = (value: MonthPayoutDisplayStatus) =>
    t(`sales.status.${value}`);
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
        <SettingsHeader title={t('sales.title')} />
        <View style={styles.gate}>
          <Text style={styles.gateTitle}>{t('sales.gateTitle')}</Text>
          <Text style={styles.gateBody}>
            {t('sales.gateBody')}
          </Text>
          <Pressable
            style={styles.gateBtn}
            onPress={() => openLogin()}
            accessibilityRole="button"
            accessibilityLabel={t('common.login')}
          >
            <Text style={styles.gateBtnText}>{t('common.login')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const status = summary?.payoutStatus ?? 'none';

  return (
    <View style={styles.root}>
      <SettingsHeader title={t('sales.title')} />
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
            accessibilityLabel={t('sales.prevMonth')}
          >
            <Text style={styles.monthBtnText}>‹</Text>
          </Pressable>
          <View style={styles.monthCenter}>
            <Text style={styles.monthLabel}>
              {monthLabel(summary?.yearMonth || yearMonth)}
            </Text>
            <Text style={styles.monthHint}>{t('sales.monthHint')}</Text>
          </View>
          <Pressable
            style={[styles.monthBtn, !canGoNext && styles.monthBtnDisabled]}
            onPress={() => {
              if (!canGoNext) return;
              setYearMonth((ym) => shiftSalesYearMonth(ym, 1));
            }}
            disabled={!canGoNext}
            accessibilityRole="button"
            accessibilityLabel={t('sales.nextMonth')}
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
              <Text style={styles.retryText}>{t('sales.reload')}</Text>
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
                  {statusLabel(status)}
                </Text>
              </View>
            </View>
            {status === 'paid' ? (
              <Text style={styles.statusHint}>
                {summary.payoutPaidAt
                  ? t('sales.paidHintWithDate', {
                      date: new Date(summary.payoutPaidAt).toLocaleDateString(
                        dateLocale,
                      ),
                    })
                  : t('sales.paidHint')}
              </Text>
            ) : status === 'awaiting_payout' ? (
              <Text style={styles.statusHint}>
                {t('sales.awaitingPayoutHint')}
              </Text>
            ) : status === 'awaiting_event' ? (
              <Text style={styles.statusHint}>
                {t('sales.awaitingEventHint')}
              </Text>
            ) : (
              <Text style={styles.statusHint}>
                {t('sales.noneHint')}
              </Text>
            )}

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>
                {status === 'paid'
                  ? t('sales.netPaid')
                  : t('sales.netPlanned')}
              </Text>
              <Text style={styles.summaryNet}>
                {formatYenAmount(summary.netYen)}
              </Text>
              <View style={styles.feeRows}>
                <View style={styles.feeRow}>
                  <Text style={styles.feeKey}>{t('sales.confirmedGross')}</Text>
                  <Text style={styles.feeVal}>
                    {formatYenAmount(summary.confirmedGrossYen)}
                  </Text>
                </View>
                {summary.pendingGrossYen > 0 ? (
                  <View style={styles.feeRow}>
                    <Text style={styles.feeKey}>{t('sales.pendingGross')}</Text>
                    <Text style={styles.feeValMuted}>
                      {formatYenAmount(summary.pendingGrossYen)}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.feeRow}>
                  <Text style={styles.feeKey}>
                    {t('sales.paymentFee', {
                      rate: Math.round(PAYMENT_FEE_RATE * 1000) / 10,
                    })}
                  </Text>
                  <Text style={styles.feeValMuted}>
                    −{formatYenAmount(summary.paymentFeeYen)}
                  </Text>
                </View>
                <View style={styles.feeRow}>
                  <Text style={styles.feeKey}>
                    {t('sales.platformFee', {
                      rate: Math.round(PLATFORM_FEE_RATE * 100),
                    })}
                  </Text>
                  <Text style={styles.feeValMuted}>
                    −{formatYenAmount(summary.platformFeeYen)}
                  </Text>
                </View>
                <View style={styles.feeRow}>
                  <Text style={styles.feeKey}>
                    {t('sales.payoutFee', {
                      amount: formatYenAmount(PAYOUT_FEE_YEN),
                    })}
                  </Text>
                  <Text style={styles.feeValMuted}>
                    −{formatYenAmount(summary.payoutFeeYen)}
                  </Text>
                </View>
              </View>
              <Text style={styles.meta}>
                {t('sales.meta', {
                  tickets: summary.ticketCount,
                  confirmed: summary.confirmedTicketCount,
                  events: summary.events.length,
                })}
              </Text>
              <Text style={styles.calcNote}>
                {t('sales.calcNote', {
                  platformRate: Math.round(PLATFORM_FEE_RATE * 100),
                  amount: formatYenAmount(PAYOUT_FEE_YEN),
                })}
              </Text>
            </View>

            <Text style={styles.sectionTitle}>{t('sales.breakdownTitle')}</Text>
            <Text style={styles.sectionHint}>
              {t('sales.breakdownHint')}
            </Text>
            {summary.events.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>
                  {t('sales.emptyTitle', { period: monthLabel(yearMonth) })}
                </Text>
                <Text style={styles.emptyBody}>
                  {t('sales.emptyBody')}
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
                    accessibilityLabel={t('sales.eventA11y', { title: item.eventTitle })}
                  >
                    <View style={styles.listText}>
                      <Text style={styles.listTitle} numberOfLines={2}>
                        {item.eventTitle}
                      </Text>
                      <Text style={styles.listCaption}>
                        {item.eventDate || t('sales.dateUnset')} ·{' '}
                        {t('sales.ticketCount', { count: item.ticketCount })}
                        {item.unitPriceYen > 0
                          ? ` × ${formatYenAmount(item.unitPriceYen)}`
                          : ''}
                        {' · '}
                        {item.confirmed
                          ? t('sales.status.awaiting_payout')
                          : t('sales.waitingForEvent')}
                      </Text>
                      <Text style={styles.listFeeLine}>
                        {t('sales.feeLine', {
                          gross: formatYenAmount(item.grossYen),
                          paymentFee: formatYenAmount(item.paymentFeeYen),
                          platformFee: formatYenAmount(item.platformFeeYen),
                          hostShare: formatYenAmount(item.netAfterPlatformYen),
                        })}
                      </Text>
                    </View>
                    <View style={styles.listAmountCol}>
                      <Text style={styles.listAmount}>
                        {formatYenAmount(item.grossYen)}
                      </Text>
                      <Text style={styles.listAmountSub}>
                        {t('sales.netLabel', {
                          amount: formatYenAmount(item.netAfterPlatformYen),
                        })}
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
                accessibilityLabel={t('sales.linkBankA11y')}
              >
                <Text style={styles.linkLabel}>{t('sales.linkBank')}</Text>
                <Text style={styles.linkChevron}>›</Text>
              </Pressable>
              <Pressable
                style={[styles.linkRow, styles.linkRowBorder]}
                onPress={() => router.push('/settings/organizer-guidelines')}
                accessibilityRole="button"
                accessibilityLabel={t('sales.linkGuideA11y')}
              >
                <Text style={styles.linkLabel}>{t('sales.linkGuide')}</Text>
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
