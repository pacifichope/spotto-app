import AppModal from '@/components/AppModal';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardFormScrollView } from '@/components/KeyboardForm';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HostAvatar from '@/components/HostAvatar';
import SnsBrandIcon from '@/components/SnsBrandIcon';
import { theme } from '@/constants/theme';
import { pickAvatarImage, pickCoverImage } from '@/lib/imagePicker';
import {
  createSnsLinkId,
  detectSnsKind,
  isValidHttpUrl,
  normalizeSnsUrl,
  SNS_KIND_OPTIONS,
  type SnsKind,
  type SnsLink,
} from '@/lib/snsLinks';
import {
  resolveDisplayImageUrl,
  uploadPublicImageOrLocal,
} from '@/lib/storage';
import {
  sanitizeOrganizerProfile,
  getOrganizerNameError,
  ORGANIZER_NAME_MAX_LENGTH,
  ORGANIZER_NAME_MIN_LENGTH,
  type OrganizerProfile,
} from '@/lib/organizerProfile';

type OrganizerProfileModalProps = {
  visible: boolean;
  profile: OrganizerProfile;
  /** イベント作成前の初回登録導線 */
  setupMode?: boolean;
  onClose: () => void;
  onSave: (profile: OrganizerProfile) => void;
};

type DraftLink = SnsLink;

function emptyLink(kind: SnsKind = 'instagram'): DraftLink {
  return { id: createSnsLinkId(), kind, url: '' };
}

function normalizeLinksForCompare(links: SnsLink[]) {
  return sanitizeOrganizerProfile({
    name: '_',
    bio: '',
    snsLinks: links
      .map((item) => ({
        ...item,
        url: normalizeSnsUrl(item.url),
      }))
      .filter((item) => item.url.length > 0),
  }).snsLinks.map((item) => ({ kind: item.kind, url: item.url }));
}

function profilesEqual(a: OrganizerProfile, b: OrganizerProfile) {
  if (a.name.trim() !== b.name.trim()) return false;
  if (a.bio.trim() !== b.bio.trim()) return false;
  if ((a.imageUri ?? '') !== (b.imageUri ?? '')) return false;
  if ((a.coverUri ?? '') !== (b.coverUri ?? '')) return false;
  const left = normalizeLinksForCompare(a.snsLinks);
  const right = normalizeLinksForCompare(b.snsLinks);
  if (left.length !== right.length) return false;
  return left.every(
    (item, index) =>
      item.kind === right[index]?.kind && item.url === right[index]?.url,
  );
}

export default function OrganizerProfileModal({
  visible,
  profile,
  setupMode = false,
  onClose,
  onSave,
}: OrganizerProfileModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<OrganizerProfile>(profile);
  const [snsDrafts, setSnsDrafts] = useState<DraftLink[]>(
    profile.snsLinks.length > 0 ? profile.snsLinks : [],
  );
  const [imageUploading, setImageUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDraft(profile);
    setSnsDrafts(profile.snsLinks.length > 0 ? profile.snsLinks : []);
    setImageUploading(false);
    setCoverUploading(false);
  }, [visible, profile]);

  const hasUnsavedChanges = useMemo(() => {
    const current = sanitizeOrganizerProfile({
      ...draft,
      snsLinks: snsDrafts,
    });
    const baseline = sanitizeOrganizerProfile(profile);
    return !profilesEqual(current, baseline);
  }, [draft, snsDrafts, profile]);

  const requestClose = () => {
    if (!hasUnsavedChanges) {
      onClose();
      return;
    }
    Alert.alert(
      t('organizer.discardTitle'),
      t('organizer.discardBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('organizer.discardConfirm'),
          style: 'destructive',
          onPress: onClose,
        },
      ],
    );
  };

  const pickImage = async () => {
    if (imageUploading || coverUploading) return;
    const localUri = await pickAvatarImage(0.85);
    if (!localUri) return;
    setDraft((prev) => ({ ...prev, imageUri: localUri }));
    setImageUploading(true);
    try {
      const uploaded = await uploadPublicImageOrLocal(localUri, 'profiles');
      if (uploaded.error) {
        Alert.alert(t('errors.cloudSaveFailed'), uploaded.error);
      }
      setDraft((prev) => ({ ...prev, imageUri: uploaded.uri }));
    } finally {
      setImageUploading(false);
    }
  };

  const pickCover = async () => {
    if (imageUploading || coverUploading) return;
    const localUri = await pickCoverImage(0.85);
    if (!localUri) return;
    setDraft((prev) => ({ ...prev, coverUri: localUri }));
    setCoverUploading(true);
    try {
      const uploaded = await uploadPublicImageOrLocal(localUri, 'clubs');
      if (uploaded.error) {
        Alert.alert(t('errors.cloudSaveFailed'), uploaded.error);
      }
      setDraft((prev) => ({ ...prev, coverUri: uploaded.uri }));
    } finally {
      setCoverUploading(false);
    }
  };

  const updateLink = (id: string, patch: Partial<DraftLink>) => {
    setSnsDrafts((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        if (typeof patch.url === 'string' && patch.url.trim() && !patch.kind) {
          next.kind = detectSnsKind(patch.url);
        }
        return next;
      }),
    );
  };

  const handleSave = () => {
    if (imageUploading || coverUploading) {
      Alert.alert(t('organizer.uploadingTitle'), t('organizer.uploadingBody'));
      return;
    }
    const nameError = getOrganizerNameError(draft.name);
    if (nameError) {
      Alert.alert(t('organizer.nameCheckTitle'), nameError);
      return;
    }
    const next = sanitizeOrganizerProfile({
      ...draft,
      snsLinks: snsDrafts
        .map((item) => ({
          ...item,
          url: normalizeSnsUrl(item.url),
        }))
        .filter((item) => item.url.length > 0),
    });
    const invalid = next.snsLinks.find((item) => !isValidHttpUrl(item.url));
    if (invalid) {
      Alert.alert(t('organizer.snsCheckTitle'), t('organizer.snsCheckBody'));
      return;
    }
    onSave(next);
  };

  const nameError = getOrganizerNameError(draft.name);
  const nameLen = draft.name.replace(/\s+/g, ' ').trim().length;
  // 入力中は空欄を赤エラーにしない（保存時のみ必須チェック）
  const nameFieldError =
    nameLen === 0
      ? null
      : nameError;

  return (
    <AppModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={requestClose}
    >
      <View style={[styles.root, { paddingTop: insets.top || 8 }]}>
          <View style={styles.header}>
            <Pressable
              onPress={requestClose}
              hitSlop={12}
              style={[styles.headerSide, styles.headerSideLeft]}
              accessibilityRole="button"
              accessibilityLabel={t('organizer.close')}
            >
              <Text style={styles.cancel}>{t('organizer.close')}</Text>
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>
              {setupMode ? t('organizer.titleSetup') : t('organizer.title')}
            </Text>
            <Pressable
              onPress={handleSave}
              hitSlop={12}
              style={[styles.headerSide, styles.headerSideRight]}
              accessibilityRole="button"
              accessibilityLabel={setupMode ? t('organizer.next') : t('organizer.save')}
            >
              <Text style={styles.save}>
                {setupMode ? t('organizer.next') : t('organizer.save')}
              </Text>
            </Pressable>
          </View>

          <KeyboardFormScrollView
            keyboardVerticalOffset={Math.max(insets.top, 8) + 52}
            contentContainerStyle={styles.content}
            bottomGap={Math.max(insets.bottom, 24)}
          >
            <Text style={styles.lead}>
              {setupMode
                ? t('organizer.leadSetup')
                : t('organizer.lead')}
            </Text>

            <Text style={styles.label}>{t('organizer.coverLabel')}</Text>
            <Pressable
              style={styles.coverBtn}
              onPress={() => void pickCover()}
              disabled={coverUploading || imageUploading}
              accessibilityRole="button"
              accessibilityLabel={t('organizer.coverChangeLabel')}
            >
              {(() => {
                const coverSrc =
                  resolveDisplayImageUrl(draft.coverUri) ||
                  draft.coverUri ||
                  undefined;
                return coverSrc ? (
                  <Image
                    source={{ uri: coverSrc }}
                    style={styles.coverPreview}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.coverPreview, styles.coverPlaceholder]}>
                    <Text style={styles.coverPlaceholderText}>
                      {t('organizer.coverAdd')}
                    </Text>
                  </View>
                );
              })()}
              <View style={styles.coverOverlay}>
                {coverUploading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.coverOverlayText}>
                    {draft.coverUri
                      ? t('organizer.coverChange')
                      : t('organizer.coverSet')}
                  </Text>
                )}
              </View>
            </Pressable>
            <Text style={styles.coverHint}>
              {t('organizer.coverHint')}
            </Text>

            <Pressable
              style={styles.iconBtn}
              onPress={() => void pickImage()}
              disabled={imageUploading || coverUploading}
            >
              <View style={styles.iconClip}>
                <HostAvatar
                  name={draft.name || t('organizer.avatarFallback')}
                  imageUri={draft.imageUri}
                  size={88}
                  borderWidth={2}
                />
                {imageUploading ? (
                  <View style={styles.iconUploading}>
                    <ActivityIndicator color="#FFFFFF" />
                  </View>
                ) : null}
              </View>
              <Text style={styles.iconHint}>
                {imageUploading
                  ? t('organizer.uploading')
                  : t('organizer.iconSet')}
              </Text>
            </Pressable>

            <Text style={styles.label}>{t('organizer.nameLabel')}</Text>
            <TextInput
              style={styles.input}
              value={draft.name}
              onChangeText={(name) =>
                setDraft((prev) => ({
                  ...prev,
                  name: name.slice(0, ORGANIZER_NAME_MAX_LENGTH),
                }))
              }
              placeholder={t('organizer.namePlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              maxLength={ORGANIZER_NAME_MAX_LENGTH}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text
              style={[
                styles.nameMeta,
                nameFieldError ? styles.nameMetaError : null,
              ]}
            >
              {nameFieldError
                ? nameFieldError
                : t('organizer.nameMeta', {
                    min: ORGANIZER_NAME_MIN_LENGTH,
                    max: ORGANIZER_NAME_MAX_LENGTH,
                    len: nameLen,
                  })}
            </Text>

            <Text style={styles.label}>{t('organizer.bioLabel')}</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={draft.bio}
              onChangeText={(bio) => setDraft((prev) => ({ ...prev, bio }))}
              placeholder={t('organizer.bioPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.label}>{t('organizer.snsLabel')}</Text>
            <Text style={styles.hint}>
              {t('organizer.snsHint')}
            </Text>

            {snsDrafts.map((link, index) => (
              <View key={link.id} style={styles.snsCard}>
                <View style={styles.snsCardHeader}>
                  <Text style={styles.snsCardTitle}>
                    {t('organizer.snsLinkN', { n: index + 1 })}
                  </Text>
                  <Pressable
                    onPress={() =>
                      setSnsDrafts((prev) =>
                        prev.filter((item) => item.id !== link.id),
                      )
                    }
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('organizer.snsRemoveLabel')}
                  >
                    <Text style={styles.removeText}>{t('organizer.snsRemove')}</Text>
                  </Pressable>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.kindRow}
                >
                  {SNS_KIND_OPTIONS.map((option) => {
                    const active = link.kind === option.kind;
                    const optionLabel =
                      option.kind === 'web'
                        ? t('organizer.snsWeb')
                        : option.label;
                    return (
                      <Pressable
                        key={option.kind}
                        style={[
                          styles.kindChip,
                          active && styles.kindChipActive,
                        ]}
                        onPress={() =>
                          updateLink(link.id, { kind: option.kind })
                        }
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={optionLabel}
                      >
                        <SnsBrandIcon kind={option.kind} size={28} />
                        <Text
                          style={[
                            styles.kindChipText,
                            active && styles.kindChipTextActive,
                          ]}
                        >
                          {optionLabel}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <TextInput
                  style={styles.snsInput}
                  value={link.url}
                  onChangeText={(url) => updateLink(link.id, { url })}
                  placeholder="https://..."
                  placeholderTextColor={theme.colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>
            ))}

            {snsDrafts.length < 8 ? (
              <Pressable
                style={styles.addBtn}
                onPress={() =>
                  setSnsDrafts((prev) => [...prev, emptyLink('web')])
                }
                accessibilityRole="button"
                accessibilityLabel={t('organizer.snsAddLabel')}
              >
                <Text style={styles.addBtnText}>{t('organizer.snsAdd')}</Text>
              </Pressable>
            ) : null}
          </KeyboardFormScrollView>
        </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  headerSide: {
    width: 72,
    justifyContent: 'center',
  },
  headerSideLeft: {
    alignItems: 'flex-start',
  },
  headerSideRight: {
    alignItems: 'flex-end',
  },
  cancel: {
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    paddingHorizontal: 8,
  },
  save: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  lead: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.colors.textSecondary,
    marginBottom: 20,
  },
  coverBtn: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: theme.colors.surfaceAlt,
  },
  coverPreview: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F2937',
    minHeight: 120,
  },
  coverPlaceholderText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
  },
  coverOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 12,
    backgroundColor: 'rgba(17, 24, 39, 0.25)',
  },
  coverOverlayText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    overflow: 'hidden',
  },
  coverHint: {
    marginBottom: 20,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  iconBtn: {
    alignItems: 'center',
    marginBottom: 22,
  },
  iconClip: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: 'hidden',
  },
  iconUploading: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconHint: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primaryDark,
  },
  label: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.text,
  },
  hint: {
    marginTop: -2,
    marginBottom: 12,
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.textMuted,
  },
  input: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: 16,
  },
  nameMeta: {
    marginTop: -10,
    marginBottom: 16,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  nameMetaError: {
    color: theme.colors.danger,
  },
  multiline: {
    minHeight: 110,
    paddingTop: 12,
  },
  snsCard: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  snsCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  snsCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.text,
  },
  removeText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.danger,
  },
  kindRow: {
    gap: 8,
    paddingVertical: 2,
  },
  kindChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  kindChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  kindChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  kindChipTextActive: {
    color: theme.colors.text,
  },
  snsInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: theme.colors.text,
  },
  addBtn: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginBottom: 8,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.primaryDark,
  },
});
