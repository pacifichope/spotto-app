import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
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
  CONTACT_CATEGORIES,
  MAX_CONTACT_IMAGES,
  bindContactIdentity,
  contactCategoryLabel,
  isValidContactEmail,
  submitContact,
  supportEmail,
  type ContactCategory,
} from '@/lib/contact';
import { pickLibraryImages } from '@/lib/imagePicker';
import { uploadPublicImageOrLocal } from '@/lib/storage';
import { useUserProfile } from '@/lib/userProfileContext';

type Attachment = { id: string; uri: string };

function notify(title: string, body: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${body}`);
    return;
  }
  Alert.alert(title, body);
}

function revokeIfBlob(uri: string) {
  if (uri.startsWith('blob:') && typeof URL !== 'undefined') {
    URL.revokeObjectURL(uri);
  }
}

export default function ContactSettingsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user, isLoggedIn } = useAuth();
  const { displayName } = useUserProfile();
  const accountEmail = (user?.email || '').trim();
  const [name, setName] = useState(
    displayName === 'You' || displayName === 'ゲスト' ? '' : displayName,
  );
  /** 返信用メール（登録メールがあれば初期値。いつでも編集可） */
  const [replyEmail, setReplyEmail] = useState(accountEmail);
  const [emailEdited, setEmailEdited] = useState(false);
  const [category, setCategory] = useState<ContactCategory>(
    CONTACT_CATEGORIES[0],
  );
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailError, setEmailError] = useState(false);

  useEffect(() => {
    if (emailEdited) return;
    if (accountEmail && replyEmail !== accountEmail) {
      setReplyEmail(accountEmail);
    }
  }, [accountEmail, emailEdited, replyEmail]);

  const remaining = MAX_CONTACT_IMAGES - attachments.length;

  const validateReplyEmail = () => {
    const email = replyEmail.trim();
    if (!email) {
      setEmailError(true);
      notify(
        t('contact.checkInputTitle'),
        t('contact.errors.emailRequired'),
      );
      return false;
    }
    if (!isValidContactEmail(email)) {
      setEmailError(true);
      notify(
        t('contact.checkInputTitle'),
        t('contact.errors.emailInvalid'),
      );
      return false;
    }
    setEmailError(false);
    return true;
  };

  const attachImages = async () => {
    if (sending || picking || remaining <= 0) return;
    setPicking(true);
    try {
      const uris = await pickLibraryImages(remaining);
      if (uris.length === 0) return;
      setAttachments((prev) => {
        const room = MAX_CONTACT_IMAGES - prev.length;
        const next = uris
          .filter((uri) => !prev.some((item) => item.uri === uri))
          .slice(0, room)
          .map((uri) => ({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            uri,
          }));
        return [...prev, ...next];
      });
    } finally {
      setPicking(false);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) revokeIfBlob(target.uri);
      return prev.filter((item) => item.id !== id);
    });
  };

  const submit = async () => {
    if (sending) return;
    if (!validateReplyEmail()) return;
    setSending(true);
    const attachmentCount = attachments.length;
    const uploaded: string[] = [];
    const uploadErrors: string[] = [];
    let cloudMissed = 0;
    for (const item of attachments) {
      const stored = await uploadPublicImageOrLocal(item.uri, 'contact');
      if (stored.error || !stored.uploaded) {
        cloudMissed += 1;
        if (stored.error) uploadErrors.push(stored.error);
      }
      uploaded.push(stored.uri);
    }
    if (attachmentCount > 0 && cloudMissed === attachmentCount) {
      setSending(false);
      notify(
        t('contact.imageSaveFailedTitle'),
        uploadErrors[0] || t('contact.imageSaveFailedBody'),
      );
      return;
    }
    const identity = bindContactIdentity(user, {
      name,
      email: replyEmail,
    });
    const result = await submitContact({
      ...identity,
      category,
      message,
      imageUris: uploaded,
    });
    setSending(false);
    if (!result.ok) {
      notify(t('contact.sendFailedTitle'), result.error);
      return;
    }
    attachments.forEach((item) => revokeIfBlob(item.uri));
    setMessage('');
    setAttachments([]);
    const title = t('contact.sentTitle');
    const extra =
      attachmentCount > 0 && cloudMissed > 0
        ? `\n\n${t('contact.imagesPartialFailed', { count: cloudMissed })}${
            uploadErrors[0] ? `\n(${uploadErrors[0]})` : ''
          }`
        : '';
    const body =
      result.channel === 'mailto'
        ? `${t('contact.sentViaMail')}${extra}`
        : `${t('contact.sentViaApi')}${extra}`;
    notify(title, body.trim());
  };

  return (
    <View style={styles.root}>
      <SettingsHeader title={t('settings.contact')} />
      <KeyboardFormScrollView
        contentContainerStyle={styles.content}
        bottomGap={Math.max(insets.bottom, 24)}
      >
        <Text style={styles.lead}>
          {t('contact.lead')}
        </Text>
        <Text style={styles.mailHint}>
          {t('contact.to', { email: supportEmail() })}
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>{t('contact.name')}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('contact.namePlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="words"
            accessibilityLabel={t('contact.name')}
          />
          <View style={styles.labelRow}>
            <Text style={styles.labelInline}>{t('contact.email')}</Text>
            <Text style={styles.requiredBadge}>{t('contact.required')}</Text>
          </View>
          <TextInput
            style={[
              styles.input,
              styles.inputEmail,
              emailError && styles.inputError,
            ]}
            value={replyEmail}
            onChangeText={(value) => {
              setEmailEdited(true);
              setEmailError(false);
              setReplyEmail(value);
            }}
            placeholder={t('contact.emailPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            accessibilityLabel={t('contact.emailA11y')}
          />
          <Text style={[styles.fieldHint, emailError && styles.fieldHintError]}>
            {emailError
              ? t('contact.errors.emailRequired')
              : isLoggedIn && accountEmail
                ? t('contact.emailHintAccount')
                : t('contact.emailHintGuest')}
          </Text>
          <Text style={styles.label}>{t('contact.category')}</Text>
          <View style={styles.chips}>
            {CONTACT_CATEGORIES.map((item) => {
              const on = item === category;
              return (
                <Pressable
                  key={item}
                  onPress={() => setCategory(item)}
                  style={[styles.chip, on && styles.chipOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={contactCategoryLabel(item)}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {contactCategoryLabel(item)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.label}>{t('contact.message')}</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={message}
            onChangeText={setMessage}
            placeholder={t('contact.messagePlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            multiline
            textAlignVertical="top"
            accessibilityLabel={t('contact.messageA11y')}
          />

          <Text style={styles.label}>{t('contact.images')}</Text>
          {attachments.length > 0 ? (
            <View style={styles.thumbs}>
              {attachments.map((item) => (
                <View key={item.id} style={styles.thumbWrap}>
                  <Image
                    source={{ uri: item.uri }}
                    style={styles.thumb}
                    resizeMode="cover"
                    accessibilityLabel={t('contact.imagePreviewA11y')}
                  />
                  <Pressable
                    onPress={() => removeAttachment(item.id)}
                    style={styles.thumbRemove}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('contact.removeImageA11y')}
                  >
                    <Text style={styles.thumbRemoveText}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <Pressable
            style={[
              styles.attachBtn,
              (picking || remaining <= 0 || sending) && styles.attachBtnBusy,
            ]}
            onPress={() => void attachImages()}
            disabled={picking || remaining <= 0 || sending}
            accessibilityRole="button"
            accessibilityLabel={t('contact.attachImage')}
          >
            {picking ? (
              <ActivityIndicator color={theme.colors.primaryDark} />
            ) : (
              <Text style={styles.attachBtnText}>
                {remaining <= 0
                  ? t('contact.imageLimit', { max: MAX_CONTACT_IMAGES })
                  : t('contact.attachImage')}
              </Text>
            )}
          </Pressable>
          <Text style={styles.attachHint}>
            {attachments.length > 0
              ? t('contact.attachHintSelected', {
                  count: attachments.length,
                  max: MAX_CONTACT_IMAGES,
                })
              : t('contact.attachHint', { max: MAX_CONTACT_IMAGES })}
          </Text>

          <Pressable
            style={[styles.submit, sending && styles.submitBusy]}
            onPress={() => void submit()}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel={t('contact.submit')}
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>{t('contact.submit')}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardFormScrollView>
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
    marginBottom: 6,
  },
  mailHint: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textMuted,
    marginBottom: 14,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  labelInline: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textSecondary,
  },
  requiredBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.danger,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
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
  inputEmail: {
    marginBottom: 6,
  },
  inputError: {
    borderColor: theme.colors.danger,
  },
  fieldHint: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    color: theme.colors.textMuted,
    marginBottom: 14,
  },
  fieldHintError: {
    color: theme.colors.danger,
    fontWeight: '700',
  },
  textarea: {
    minHeight: 140,
    paddingTop: 12,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    paddingHorizontal: 12,
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
  thumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  thumbWrap: {
    width: 76,
    height: 76,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  thumb: {
    width: 76,
    height: 76,
  },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(17, 24, 39, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemoveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginTop: -1,
  },
  attachBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.pill,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  attachBtnBusy: {
    opacity: 0.55,
  },
  attachBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.text,
  },
  attachHint: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
    lineHeight: 18,
    marginBottom: 16,
  },
  submit: {
    marginTop: 4,
    backgroundColor: theme.colors.primaryDark,
    borderRadius: theme.radius.pill,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBusy: {
    opacity: 0.7,
  },
  submitText: {
    color: theme.colors.onPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
});
