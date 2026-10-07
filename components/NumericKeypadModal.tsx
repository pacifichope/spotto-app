import AppModal from '@/components/AppModal';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';
import { numberLocale } from '@/lib/createEventLabels';

type NumericKeypadModalProps = {
  visible: boolean;
  value: string;
  onCancel: () => void;
  onConfirm: (next: string) => void;
  title: string;
  subtitle?: string;
  note: string;
  prefix?: string;
  suffix?: string;
  max: number;
  min?: number;
};

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'del'],
] as const;

function toDraft(value: string) {
  const n = Math.floor(Math.abs(Number(value)));
  if (!Number.isFinite(n) || n <= 0) return '0';
  return String(n);
}

function formatDisplay(draft: string) {
  const n = Math.floor(Math.abs(Number(draft) || 0));
  return n.toLocaleString(numberLocale());
}

function applyKey(draft: string, key: string, max: number) {
  if (key === '' || key === '.') return draft;
  if (key === 'del') {
    if (draft.length <= 1) return '0';
    return draft.slice(0, -1);
  }
  const next = draft === '0' ? key : `${draft}${key}`;
  if (Number(next) > max) return draft;
  return next;
}

export default function NumericKeypadModal({
  visible,
  value,
  onCancel,
  onConfirm,
  title,
  subtitle,
  note,
  prefix,
  suffix,
  max,
  min = 0,
}: NumericKeypadModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('0');

  useEffect(() => {
    if (!visible) return;
    setDraft(toDraft(value));
  }, [visible, value]);

  const handleConfirm = () => {
    const amount = Math.min(
      max,
      Math.max(min, Math.floor(Number(draft) || 0)),
    );
    onConfirm(String(amount));
  };

  const display = `${prefix ? `${prefix} ` : ''}${formatDisplay(draft)}${
    suffix ? ` ${suffix}` : ''
  }`;

  return (
    <AppModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onCancel} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={styles.header}>
            <Pressable onPress={onCancel} hitSlop={10} style={styles.headerSide}>
              <Text style={styles.cancel}>{t('common.cancel')}</Text>
            </Pressable>
            <View style={styles.headerCenter}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={handleConfirm} hitSlop={10} style={styles.headerSideRight}>
              <Text style={styles.confirm}>{t('common.confirm')}</Text>
            </Pressable>
          </View>

          <Text style={styles.amount}>{display}</Text>
          <Text style={styles.note}>{note}</Text>

          <View style={styles.keypad}>
            {KEYS.map((row) => (
              <View key={row.join('-')} style={styles.keyRow}>
                {row.map((key) => (
                  <Pressable
                    key={key || 'spacer'}
                    disabled={key === ''}
                    style={({ pressed }) => [
                      styles.key,
                      key === '' && styles.keyHidden,
                      pressed && key !== '' && styles.keyPressed,
                    ]}
                    onPress={() => {
                      if (key === '') return;
                      setDraft((prev) => applyKey(prev, key, max));
                    }}
                  >
                    {key !== '' ? (
                      <Text style={styles.keyText}>
                        {key === 'del' ? '⌫' : key}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dismiss: {
    flex: 1,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 14,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerSide: {
    minWidth: 72,
  },
  headerSideRight: {
    minWidth: 72,
    alignItems: 'flex-end',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  cancel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  cancelJp: {
    marginTop: 1,
    fontSize: 10,
    color: '#9CA3AF',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  confirm: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.primaryDark,
  },
  confirmJp: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  amount: {
    textAlign: 'center',
    fontSize: 36,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  note: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
    color: '#9CA3AF',
    paddingHorizontal: 12,
    marginBottom: 18,
  },
  keypad: {
    gap: 8,
  },
  keyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  key: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: {
    backgroundColor: '#E8E8E8',
  },
  keyHidden: {
    backgroundColor: 'transparent',
  },
  keyText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
  },
});
