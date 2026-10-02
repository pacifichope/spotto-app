import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardFormScrollView } from '@/components/KeyboardForm';
import SettingsHeader from '@/components/SettingsHeader';
import { theme } from '@/constants/theme';
import { useAuth } from '@/lib/authContext';
import {
  BANK_ACCOUNT_TYPE_OPTIONS,
  EMPTY_BANK_ACCOUNT,
  SUPPORTED_BANKS,
  deleteOrganizerBankAccount,
  fetchOrganizerBankAccount,
  maskAccountNumber,
  normalizeAccountNumber,
  normalizeBranchNumber,
  normalizeHolderKana,
  saveOrganizerBankAccount,
  validateOrganizerBankAccount,
  type BankAccountType,
  type OrganizerBankAccount,
} from '@/lib/organizerBankAccount';

function notify(title: string, body: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${body}`);
    return;
  }
  Alert.alert(title, body);
}

export default function BankAccountSettingsScreen() {
  const { t } = useTranslation();
  const accountTypeText = (type: BankAccountType) =>
    t(`bankAccount.accountType.${type}`);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isLoggedIn, openLogin } = useAuth();
  const [form, setForm] = useState<OrganizerBankAccount>(EMPTY_BANK_ACCOUNT);
  const [saved, setSaved] = useState<OrganizerBankAccount | null>(null);
  const [editing, setEditing] = useState(false);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDraft, setConfirmDraft] = useState<OrganizerBankAccount | null>(
    null,
  );
  const [fieldError, setFieldError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const showForm = editing || !saved;

  const load = useCallback(async () => {
    if (!user?.id) {
      setSaved(null);
      setForm(EMPTY_BANK_ACCOUNT);
      setEditing(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await fetchOrganizerBankAccount(user.id);
    setLoading(false);
    if (!result.ok) {
      notify(t('bankAccount.loadFailedTitle'), result.error);
      return;
    }
    setSaved(result.account);
    setForm(result.account ?? EMPTY_BANK_ACCOUNT);
    setEditing(!result.account);
    setFieldError('');
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = <K extends keyof OrganizerBankAccount>(
    key: K,
    value: OrganizerBankAccount[K],
  ) => {
    setFieldError('');
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const startEdit = () => {
    setForm(saved ?? EMPTY_BANK_ACCOUNT);
    setFieldError('');
    setEditing(true);
  };

  const cancelEdit = () => {
    if (saved) {
      setForm(saved);
      setEditing(false);
      setFieldError('');
      return;
    }
    setForm(EMPTY_BANK_ACCOUNT);
  };

  const closeConfirm = () => {
    if (saving) return;
    setConfirmOpen(false);
    setConfirmDraft(null);
  };

  /** 「保存する」→ 検証のみ行い、確認モーダルを開く */
  const onPressSave = () => {
    if (!isLoggedIn || !user?.id) {
      openLogin();
      return;
    }
    if (saving) return;
    const validated = validateOrganizerBankAccount(form);
    if (!validated.ok) {
      setFieldError(validated.error);
      return;
    }
    setFieldError('');
    setForm(validated.account);
    setConfirmDraft(validated.account);
    setConfirmOpen(true);
  };

  /** 確認モーダルで確定 → DB 保存 */
  const onConfirmSave = async () => {
    if (!isLoggedIn || !user?.id || !confirmDraft) {
      openLogin();
      return;
    }
    if (saving) return;
    setSaving(true);
    const result = await saveOrganizerBankAccount(confirmDraft, user.id);
    setSaving(false);
    if (!result.ok) {
      setConfirmOpen(false);
      setConfirmDraft(null);
      setFieldError(result.error);
      notify(t('bankAccount.saveFailedTitle'), result.error);
      return;
    }
    setConfirmOpen(false);
    setConfirmDraft(null);
    setSaved(result.account);
    setForm(result.account);
    setEditing(false);
    setFieldError('');
    notify(
      t('bankAccount.savedTitle'),
      t('bankAccount.savedBody'),
    );
  };

  const onClear = () => {
    if (!user?.id || !saved) return;
    const run = async () => {
      setSaving(true);
      const result = await deleteOrganizerBankAccount(user.id);
      setSaving(false);
      if (!result.ok) {
        notify(t('bankAccount.deleteFailedTitle'), result.error);
        return;
      }
      setSaved(null);
      setForm(EMPTY_BANK_ACCOUNT);
      setEditing(true);
      setFieldError('');
      notify(t('bankAccount.deletedTitle'), t('bankAccount.deletedBody'));
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(t('bankAccount.deleteConfirm'))) {
        void run();
      }
      return;
    }
    Alert.alert(t('bankAccount.deleteTitle'), t('bankAccount.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void run() },
    ]);
  };

  if (!isLoggedIn) {
    return (
      <View style={styles.root}>
        <SettingsHeader title={t('bankAccount.title')} />
        <View style={styles.loginGate}>
          <Text style={styles.loginTitle}>{t('bankAccount.loginRequired')}</Text>
          <Text style={styles.loginBody}>
            {t('bankAccount.loginBody')}
          </Text>
          <Pressable
            style={styles.loginBtn}
            onPress={() => openLogin()}
            accessibilityRole="button"
            accessibilityLabel={t('common.login')}
          >
            <Text style={styles.loginBtnText}>{t('common.login')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SettingsHeader title={t('bankAccount.title')} />
      <KeyboardFormScrollView
        contentContainerStyle={styles.content}
        bottomGap={Math.max(insets.bottom, 24)}
      >
        <Text style={styles.lead}>
          {t('bankAccount.lead')}
        </Text>

        {loading ? (
          <ActivityIndicator
            color={theme.colors.primaryDark}
            style={{ marginTop: 24 }}
          />
        ) : !showForm && saved ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('bankAccount.registered')}</Text>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewKey}>{t('bankAccount.bank')}</Text>
              <Text style={styles.reviewVal}>{saved.bankName}</Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewKey}>{t('bankAccount.branch')}</Text>
              <Text style={styles.reviewVal}>
                {saved.branchName}
                {saved.branchNumber ? `（${saved.branchNumber}）` : ''}
              </Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewKey}>{t('bankAccount.accountTypeLabel')}</Text>
              <Text style={styles.reviewVal}>
                {accountTypeText(saved.accountType)}
              </Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewKey}>{t('bankAccount.accountNumber')}</Text>
              <Text style={styles.reviewVal}>
                {maskAccountNumber(saved.accountNumber)}
              </Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewKey}>{t('bankAccount.holder')}</Text>
              <Text style={styles.reviewVal}>{saved.accountHolderKana}</Text>
            </View>
            <View style={[styles.reviewRow, styles.reviewRowLast]}>
              <Text style={styles.reviewKey}>{t('bankAccount.notifyEmailShort')}</Text>
              <Text style={styles.reviewVal}>
                {saved.notifyEmail || t('bankAccount.notSet')}
              </Text>
            </View>

            <Pressable
              style={styles.saveBtn}
              onPress={startEdit}
              accessibilityRole="button"
              accessibilityLabel={t('bankAccount.changeA11y')}
            >
              <Text style={styles.saveBtnText}>{t('bankAccount.change')}</Text>
            </Pressable>
            <Pressable
              style={styles.clearBtn}
              onPress={onClear}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={t('bankAccount.deleteA11y')}
            >
              <Text style={styles.clearBtnText}>{t('bankAccount.clear')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            {saved && editing ? (
              <Text style={styles.editHint}>{t('bankAccount.editHint')}</Text>
            ) : null}

            <Text style={styles.label}>{t('bankAccount.bankName')}</Text>
            <Pressable
              style={styles.selectBtn}
              onPress={() => setBankPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('bankAccount.pickerTitle')}
            >
              <Text
                style={[
                  styles.selectBtnText,
                  !form.bankName && styles.selectBtnPlaceholder,
                ]}
              >
                {form.bankName || t('bankAccount.selectFromList')}
              </Text>
              <Text style={styles.selectChevron}>›</Text>
            </Pressable>
            <Pressable
              style={styles.bankHint}
              onPress={() => router.push('/settings/contact')}
              accessibilityRole="link"
              accessibilityLabel={t('bankAccount.bankNotListedA11y')}
            >
              <Text style={styles.bankHintText}>
                {t('bankAccount.bankNotListed')}
              </Text>
              <Text style={styles.bankHintLink}>{t('bankAccount.contactLink')}</Text>
            </Pressable>

            <Text style={styles.label}>{t('bankAccount.branchName')}</Text>
            <TextInput
              style={styles.input}
              value={form.branchName}
              onChangeText={(v) => update('branchName', v)}
              placeholder={t('bankAccount.branchNamePlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel={t('bankAccount.branchName')}
            />

            <Text style={styles.label}>{t('bankAccount.branchNumber')}</Text>
            <TextInput
              style={styles.input}
              value={form.branchNumber}
              onChangeText={(v) =>
                update('branchNumber', normalizeBranchNumber(v))
              }
              placeholder={t('bankAccount.branchNumberPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="number-pad"
              maxLength={3}
              autoComplete="off"
              accessibilityLabel={t('bankAccount.branchNumber')}
            />

            <Text style={styles.label}>{t('bankAccount.accountTypeLabel')}</Text>
            <View style={styles.chips}>
              {BANK_ACCOUNT_TYPE_OPTIONS.map((opt) => {
                const on = form.accountType === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() =>
                      update('accountType', opt.value as BankAccountType)
                    }
                    style={[styles.chip, on && styles.chipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={accountTypeText(opt.value)}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {accountTypeText(opt.value)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>{t('bankAccount.accountNumber')}</Text>
            <TextInput
              style={styles.input}
              value={form.accountNumber}
              onChangeText={(v) =>
                update('accountNumber', normalizeAccountNumber(v))
              }
              placeholder={t('bankAccount.accountNumberPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="number-pad"
              maxLength={7}
              autoComplete="off"
              accessibilityLabel={t('bankAccount.accountNumber')}
            />

            <Text style={styles.label}>{t('bankAccount.holderKana')}</Text>
            <TextInput
              style={styles.input}
              value={form.accountHolderKana}
              onChangeText={(v) => update('accountHolderKana', v)}
              onBlur={() =>
                update(
                  'accountHolderKana',
                  normalizeHolderKana(form.accountHolderKana),
                )
              }
              placeholder={t('bankAccount.holderKanaPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel={t('bankAccount.holderKana')}
            />

            <Text style={styles.label}>{t('bankAccount.notifyEmail')}</Text>
            <TextInput
              style={styles.input}
              value={form.notifyEmail}
              onChangeText={(v) => update('notifyEmail', v)}
              onBlur={() =>
                update('notifyEmail', form.notifyEmail.trim().toLowerCase())
              }
              placeholder={t('bankAccount.notifyEmailPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              accessibilityLabel={t('bankAccount.notifyEmail')}
            />
            <Text style={styles.fieldHint}>
              {t('bankAccount.notifyEmailHint')}
            </Text>

            {fieldError ? (
              <Text style={styles.fieldError}>{fieldError}</Text>
            ) : null}

            <Pressable
              style={[styles.saveBtn, saving && styles.saveBtnBusy]}
              onPress={onPressSave}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={t('bankAccount.saveReviewA11y')}
            >
              <Text style={styles.saveBtnText}>{t('bankAccount.save')}</Text>
            </Pressable>

            {saved && editing ? (
              <Pressable
                style={styles.cancelEditBtn}
                onPress={cancelEdit}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={t('bankAccount.cancelEdit')}
              >
                <Text style={styles.cancelEditText}>{t('bankAccount.cancelEdit')}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </KeyboardFormScrollView>

      <Modal
        visible={bankPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setBankPickerOpen(false)}
      >
        <View style={styles.pickerOverlay}>
          <Pressable
            style={styles.pickerBackdrop}
            onPress={() => setBankPickerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
          <View
            style={[
              styles.pickerSheet,
              { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>{t('bankAccount.pickerTitle')}</Text>
              <Pressable
                onPress={() => setBankPickerOpen(false)}
                hitSlop={12}
                style={styles.pickerCloseBtn}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Text style={styles.pickerCloseText}>×</Text>
              </Pressable>
            </View>
            <FlatList
              data={[...SUPPORTED_BANKS]}
              keyExtractor={(item) => item}
              style={styles.pickerList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const on = form.bankName === item;
                return (
                  <Pressable
                    style={[styles.pickerRow, on && styles.pickerRowOn]}
                    onPress={() => {
                      update('bankName', item);
                      setBankPickerOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={item}
                  >
                    <Text
                      style={[
                        styles.pickerRowText,
                        on && styles.pickerRowTextOn,
                      ]}
                    >
                      {item}
                    </Text>
                  </Pressable>
                );
              }}
            />
            <Pressable
              style={styles.pickerCancelBtn}
              onPress={() => setBankPickerOpen(false)}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text style={styles.pickerCancelText}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={confirmOpen}
        animationType="fade"
        transparent
        onRequestClose={closeConfirm}
      >
        <View style={styles.confirmOverlay}>
          <Pressable
            style={styles.confirmBackdrop}
            onPress={closeConfirm}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
          <View
            style={[
              styles.confirmCard,
              { marginBottom: Math.max(insets.bottom, 24) },
            ]}
          >
            <Text style={styles.confirmTitle}>{t('bankAccount.confirmTitle')}</Text>
            <Text style={styles.confirmLead}>
              {t('bankAccount.confirmLead')}
            </Text>

            {confirmDraft ? (
              <View style={styles.confirmList}>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmKey}>{t('bankAccount.bankName')}</Text>
                  <Text style={styles.confirmVal}>{confirmDraft.bankName}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmKey}>{t('bankAccount.branchNameAndNumber')}</Text>
                  <Text style={styles.confirmVal}>
                    {confirmDraft.branchName}（{confirmDraft.branchNumber}）
                  </Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmKey}>{t('bankAccount.accountTypeLabel')}</Text>
                  <Text style={styles.confirmVal}>
                    {accountTypeText(confirmDraft.accountType)}
                  </Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmKey}>{t('bankAccount.accountNumber')}</Text>
                  <Text style={styles.confirmVal}>
                    {confirmDraft.accountNumber}
                  </Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmKey}>{t('bankAccount.holder')}</Text>
                  <Text style={styles.confirmVal}>
                    {confirmDraft.accountHolderKana}
                  </Text>
                </View>
                <View style={[styles.confirmRow, styles.confirmRowLast]}>
                  <Text style={styles.confirmKey}>{t('bankAccount.notifyEmailShort')}</Text>
                  <Text style={styles.confirmVal}>
                    {confirmDraft.notifyEmail}
                  </Text>
                </View>
              </View>
            ) : null}

            <Pressable
              style={[styles.confirmPrimaryBtn, saving && styles.saveBtnBusy]}
              onPress={() => void onConfirmSave()}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={t('bankAccount.confirmRegister')}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmPrimaryText}>
                  {t('bankAccount.confirmRegister')}
                </Text>
              )}
            </Pressable>
            <Pressable
              style={styles.confirmSecondaryBtn}
              onPress={closeConfirm}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={t('bankAccount.confirmBack')}
            >
              <Text style={styles.confirmSecondaryText}>{t('bankAccount.confirmBack')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  },
  lead: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 14,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 14,
  },
  editHint: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMuted,
    marginBottom: 12,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  reviewRowLast: {
    borderBottomWidth: 0,
    marginBottom: 8,
  },
  reviewKey: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
    width: 88,
  },
  reviewVal: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'right',
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'web' ? 12 : 13,
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 14,
  },
  selectBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'web' ? 12 : 13,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  selectBtnText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  selectBtnPlaceholder: {
    color: theme.colors.textMuted,
    fontWeight: '500',
  },
  selectChevron: {
    fontSize: 22,
    fontWeight: '300',
    color: theme.colors.textMuted,
  },
  bankHint: {
    marginTop: -6,
    marginBottom: 14,
    gap: 4,
  },
  bankHintText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    color: theme.colors.textMuted,
  },
  bankHintLink: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.primaryDark,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  chipOn: {
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textSecondary,
  },
  chipTextOn: {
    color: '#FFFFFF',
  },
  fieldHint: {
    marginTop: -8,
    marginBottom: 14,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  fieldError: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    color: '#A35D5D',
    marginBottom: 12,
  },
  saveBtn: {
    marginTop: 4,
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.pill,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnBusy: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  cancelEditBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelEditText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  clearBtn: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 8,
  },
  clearBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#A35D5D',
  },
  loginGate: {
    paddingHorizontal: 24,
    paddingTop: 40,
    gap: 12,
  },
  loginTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  loginBody: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  loginBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: theme.colors.text,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  pickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  pickerSheet: {
    zIndex: 1,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
    paddingTop: 12,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 4,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
  },
  pickerCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceAlt,
  },
  pickerCloseText: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginTop: -1,
  },
  pickerList: {
    paddingHorizontal: 8,
    flexShrink: 1,
  },
  pickerRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
  },
  pickerRowOn: {
    backgroundColor: theme.colors.surfaceAlt,
  },
  pickerRowText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  pickerRowTextOn: {
    fontWeight: '800',
  },
  pickerCancelBtn: {
    marginTop: 8,
    marginHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  pickerCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  confirmOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  confirmBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  confirmCard: {
    zIndex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 6,
  },
  confirmLead: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 14,
  },
  confirmList: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  confirmRowLast: {
    borderBottomWidth: 0,
  },
  confirmKey: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
    width: 108,
  },
  confirmVal: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'right',
    lineHeight: 22,
  },
  confirmPrimaryBtn: {
    backgroundColor: theme.colors.primaryDark,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 12,
    marginBottom: 8,
  },
  confirmPrimaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  confirmSecondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  confirmSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
});
