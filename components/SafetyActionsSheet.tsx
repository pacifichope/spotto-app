import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingScreen } from '@/components/KeyboardForm';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';
import {
  REPORT_SUCCESS_MESSAGE,
  submitUserReport,
  type ReportTargetType,
} from '@/lib/reports';

const MAX_REASON_LENGTH = 400;

type SafetyActionsSheetProps = {
  visible: boolean;
  name: string;
  /** 通報対象のユーザー ID（Firebase UID 等） */
  targetId: string;
  targetType?: ReportTargetType;
  isBlocked?: boolean;
  onClose: () => void;
  onBlock: () => void;
  onUnblock?: () => void;
};

type Step = 'menu' | 'form' | 'done';

export default function SafetyActionsSheet({
  visible,
  name,
  targetId,
  targetType = 'user',
  isBlocked = false,
  onClose,
  onBlock,
  onUnblock,
}: SafetyActionsSheetProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('menu');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) return;
    setStep('menu');
    setReason('');
    setSubmitting(false);
  }, [visible]);

  if (!visible) return null;

  const handleBlock = () => {
    onClose();
    if (isBlocked) {
      onUnblock?.();
      return;
    }
    onBlock();
  };

  const submitReport = async () => {
    const trimmed = reason.trim();
    if (!trimmed || submitting) return;
    const id = String(targetId || '').trim();
    if (!id) {
      Alert.alert('通報できません', '通報対象を特定できませんでした。');
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitUserReport({
        targetUserId: id,
        targetName: name,
        targetType,
        reason: trimmed,
      });
      if (!result.ok) {
        Alert.alert('送信できませんでした', result.error);
        return;
      }
      setStep('done');
      Alert.alert('通報を受け付けました', REPORT_SUCCESS_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  };

  const finish = () => {
    onClose();
  };

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable
        style={styles.backdrop}
        onPress={
          submitting
            ? undefined
            : step === 'form'
              ? () => setStep('menu')
              : finish
        }
        accessibilityRole="button"
        accessibilityLabel="閉じる"
      />
      {step === 'menu' ? (
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 14) },
          ]}
        >
          <Text style={styles.caption} numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.card}>
            <Pressable
              style={styles.row}
              onPress={handleBlock}
              accessibilityRole="button"
              accessibilityLabel={
                isBlocked
                  ? `${name}のブロックを解除`
                  : 'このユーザーをブロックする'
              }
            >
              <Text style={[styles.rowLabel, !isBlocked && styles.danger]}>
                {isBlocked ? 'ブロックを解除' : 'このユーザーをブロックする'}
              </Text>
            </Pressable>
            <View style={styles.divider} />
            <Pressable
              style={styles.row}
              onPress={() => setStep('form')}
              accessibilityRole="button"
              accessibilityLabel={`${name}を通報する`}
            >
              <Text style={[styles.rowLabel, styles.danger]}>通報する</Text>
            </Pressable>
          </View>
          <Pressable
            style={styles.cancel}
            onPress={finish}
            accessibilityRole="button"
            accessibilityLabel="キャンセル"
          >
            <Text style={styles.cancelLabel}>キャンセル</Text>
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingScreen style={styles.popupWrap}>
          <View
            style={[
              styles.popup,
              { marginBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            {step === 'form' ? (
              <>
                <Text style={styles.popupTitle}>通報</Text>
                <Text style={styles.popupLead}>
                  {name}{' '}
                  について、通報の理由や詳しい内容を入力してください。
                </Text>
                <TextInput
                  style={styles.textarea}
                  value={reason}
                  onChangeText={setReason}
                  placeholder="通報の理由や詳細な内容"
                  placeholderTextColor={theme.colors.textMuted}
                  multiline
                  textAlignVertical="top"
                  maxLength={MAX_REASON_LENGTH}
                  autoFocus
                  editable={!submitting}
                  accessibilityLabel="通報の理由や詳細な内容"
                />
                <Text style={styles.counter}>
                  {reason.length}/{MAX_REASON_LENGTH}
                </Text>
                <View style={styles.popupActions}>
                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={() => {
                      if (submitting) return;
                      setReason('');
                      setStep('menu');
                    }}
                    disabled={submitting}
                    accessibilityRole="button"
                    accessibilityLabel="キャンセル"
                  >
                    <Text style={styles.secondaryBtnText}>キャンセル</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.primaryBtn,
                      (!reason.trim() || submitting) &&
                        styles.primaryBtnDisabled,
                    ]}
                    onPress={() => {
                      void submitReport();
                    }}
                    disabled={!reason.trim() || submitting}
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled: !reason.trim() || submitting,
                      busy: submitting,
                    }}
                    accessibilityLabel="送信する"
                  >
                    {submitting ? (
                      <ActivityIndicator color={theme.colors.onPrimary} />
                    ) : (
                      <Text style={styles.primaryBtnText}>送信する</Text>
                    )}
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.popupTitle}>通報を受け付けました</Text>
                <Text style={styles.popupLead}>{REPORT_SUCCESS_MESSAGE}</Text>
                <Pressable
                  style={styles.okBtn}
                  onPress={finish}
                  accessibilityRole="button"
                  accessibilityLabel="OK"
                >
                  <Text style={styles.okBtnText}>OK</Text>
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingScreen>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    zIndex: 30,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(17, 24, 39, 0.4)',
  },
  sheet: {
    paddingHorizontal: 12,
    gap: 8,
  },
  caption: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  rowLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
  },
  danger: {
    color: theme.colors.danger,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
  },
  cancel: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },
  popupWrap: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  popup: {
    marginHorizontal: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
  },
  popupTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
    textAlign: 'center',
  },
  popupLead: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  textarea: {
    marginTop: 16,
    minHeight: 120,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.text,
  },
  counter: {
    marginTop: 6,
    alignSelf: 'flex-end',
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  popupActions: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text,
  },
  primaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    backgroundColor: '#D1D5DB',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.onPrimary,
  },
  okBtn: {
    marginTop: 20,
    minHeight: 48,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  okBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
