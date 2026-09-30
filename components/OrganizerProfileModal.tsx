import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
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
      '変更を破棄しますか？',
      '変更内容が破棄されますがよろしいですか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '破棄する',
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
        Alert.alert('クラウドに保存できませんでした', uploaded.error);
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
        Alert.alert('クラウドに保存できませんでした', uploaded.error);
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
      Alert.alert(
        '画像をアップロード中です',
        '完了してから保存してください。',
      );
      return;
    }
    const nameError = getOrganizerNameError(draft.name);
    if (nameError) {
      Alert.alert('サークル名を確認してください', nameError);
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
      Alert.alert(
        'SNSリンクを確認してください',
        'https:// から始まる正しいURLを入力してください。',
      );
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
    <Modal
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
              accessibilityLabel="閉じる"
            >
              <Text style={styles.cancel}>閉じる</Text>
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>
              {setupMode ? '主催者アカウント登録' : '主催者プロフィール'}
            </Text>
            <Pressable
              onPress={handleSave}
              hitSlop={12}
              style={[styles.headerSide, styles.headerSideRight]}
              accessibilityRole="button"
              accessibilityLabel={setupMode ? '次へ' : '保存'}
            >
              <Text style={styles.save}>{setupMode ? '次へ' : '保存'}</Text>
            </Pressable>
          </View>

          <KeyboardFormScrollView
            keyboardVerticalOffset={Math.max(insets.top, 8) + 52}
            contentContainerStyle={styles.content}
            bottomGap={Math.max(insets.bottom, 24)}
          >
            <Text style={styles.lead}>
              {setupMode
                ? 'イベントを作成するには、主催者名の登録が必要です。アイコンやカバー写真は任意で設定できます。電話番号認証の次のステップです。'
                : 'イベント公開時に参加者へ表示される、サークル／チーム用の情報です。個人アカウントとは別に管理されます。'}
            </Text>

            <Text style={styles.label}>カバー写真</Text>
            <Pressable
              style={styles.coverBtn}
              onPress={() => void pickCover()}
              disabled={coverUploading || imageUploading}
              accessibilityRole="button"
              accessibilityLabel="カバー写真を変更"
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
                      カバー写真を追加
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
                      ? 'カバー写真を変更'
                      : 'カバー写真を設定'}
                  </Text>
                )}
              </View>
            </Pressable>
            <Text style={styles.coverHint}>
              クラブプロフィール上部に表示される横長のヘッダー画像です（任意）
            </Text>

            <Pressable
              style={styles.iconBtn}
              onPress={() => void pickImage()}
              disabled={imageUploading || coverUploading}
            >
              <View style={styles.iconClip}>
                <HostAvatar
                  name={draft.name || '主'}
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
                  ? 'アップロード中…'
                  : 'アイコン・ロゴを設定'}
              </Text>
            </Pressable>

            <Text style={styles.label}>サークル名（主催者名）</Text>
            <TextInput
              style={styles.input}
              value={draft.name}
              onChangeText={(name) =>
                setDraft((prev) => ({
                  ...prev,
                  name: name.slice(0, ORGANIZER_NAME_MAX_LENGTH),
                }))
              }
              placeholder="例: Yoyogi FC / 朝ランサークル"
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
                : `${ORGANIZER_NAME_MIN_LENGTH}〜${ORGANIZER_NAME_MAX_LENGTH}文字（${nameLen}/${ORGANIZER_NAME_MAX_LENGTH}）`}
            </Text>

            <Text style={styles.label}>紹介文・活動内容</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={draft.bio}
              onChangeText={(bio) => setDraft((prev) => ({ ...prev, bio }))}
              placeholder="どんなメンバーで、どんな活動をしているかを紹介"
              placeholderTextColor={theme.colors.textMuted}
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.label}>SNS / Web（任意・複数可）</Text>
            <Text style={styles.hint}>
              Instagram・X・LINE・公式サイトを複数登録できます。クラブページにブランドアイコンで表示されます。
            </Text>

            {snsDrafts.map((link, index) => (
              <View key={link.id} style={styles.snsCard}>
                <View style={styles.snsCardHeader}>
                  <Text style={styles.snsCardTitle}>リンク {index + 1}</Text>
                  <Pressable
                    onPress={() =>
                      setSnsDrafts((prev) =>
                        prev.filter((item) => item.id !== link.id),
                      )
                    }
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="このリンクを削除"
                  >
                    <Text style={styles.removeText}>削除</Text>
                  </Pressable>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.kindRow}
                >
                  {SNS_KIND_OPTIONS.map((option) => {
                    const active = link.kind === option.kind;
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
                        accessibilityLabel={option.label}
                      >
                        <SnsBrandIcon kind={option.kind} size={28} />
                        <Text
                          style={[
                            styles.kindChipText,
                            active && styles.kindChipTextActive,
                          ]}
                        >
                          {option.label}
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
                accessibilityLabel="SNSリンクを追加"
              >
                <Text style={styles.addBtnText}>＋ リンクを追加</Text>
              </Pressable>
            ) : null}
          </KeyboardFormScrollView>
        </View>
    </Modal>
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
