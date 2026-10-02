import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HostAvatar from '@/components/HostAvatar';
import { KeyboardFormScrollView } from '@/components/KeyboardForm';
import { theme } from '@/constants/theme';
import { pickAvatarImage } from '@/lib/imagePicker';
import { uploadPublicImageOrLocal } from '@/lib/storage';
import {
  sanitizeUserProfile,
  USER_GENDER_OPTIONS,
  type UserGender,
  type UserProfile,
} from '@/lib/userProfile';
type PersonalProfileModalProps = {
  visible: boolean;
  profile: UserProfile;
  onClose: () => void;
  onSave: (profile: UserProfile) => void;
};

const GENDER_UI: Record<
  UserGender,
  {
    icon: 'gender-male' | 'gender-female';
    accent: string;
    soft: string;
    border: string;
  }
> = {
  男性: {
    icon: 'gender-male',
    accent: theme.colors.genderMale,
    soft: theme.colors.genderMaleSoft,
    border: theme.colors.genderMaleBorder,
  },
  女性: {
    icon: 'gender-female',
    accent: theme.colors.genderFemale,
    soft: theme.colors.genderFemaleSoft,
    border: theme.colors.genderFemaleBorder,
  },
};

export default function PersonalProfileModal({
  visible,
  profile,
  onClose,
  onSave,
}: PersonalProfileModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [imageUploading, setImageUploading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDraft(profile);
    setImageUploading(false);
  }, [visible, profile]);

  const pickImage = async () => {
    if (imageUploading) return;
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

  const handleSave = () => {
    if (imageUploading) {
      Alert.alert(t('profile.uploadingTitle'), t('profile.uploadingBody'));
      return;
    }
    const next = sanitizeUserProfile(draft);
    if (!next.name) {
      Alert.alert(t('profile.nameMissingTitle'), t('profile.nameMissingBody'));
      return;
    }
    if (!next.gender) {
      Alert.alert(
        t('profile.genderMissingTitle'),
        t('profile.genderMissingBody'),
      );
      return;
    }
    onSave(next);
  };

  const selectGender = (gender: UserGender) => {
    setDraft((prev) => ({ ...prev, gender }));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top || 8 }]}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('profile.close')}
          >
            <Text style={styles.cancel}>{t('profile.close')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('profile.title')}</Text>
          <Pressable
            onPress={handleSave}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('profile.save')}
            disabled={imageUploading}
          >
            <Text
              style={[styles.save, imageUploading && styles.saveDisabled]}
            >
              {t('profile.save')}
            </Text>
          </Pressable>
        </View>

        <KeyboardFormScrollView
          keyboardVerticalOffset={Math.max(insets.top, 8) + 52}
          contentContainerStyle={styles.content}
          bottomGap={Math.max(insets.bottom, 24)}
        >
          <Text style={styles.lead}>{t('profile.lead')}</Text>

          <Pressable
            style={styles.iconBtn}
            onPress={() => void pickImage()}
            disabled={imageUploading}
            accessibilityRole="button"
            accessibilityLabel={t('profile.changePhoto')}
            accessibilityState={{ busy: imageUploading }}
          >
            <View style={styles.iconClip}>
              <HostAvatar
                name={draft.name || t('profile.avatarFallback')}
                imageUri={draft.imageUri}
                size={88}
                gender={draft.gender}
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
                ? t('profile.uploading')
                : t('profile.changePhoto')}
            </Text>
          </Pressable>

          <Text style={styles.label}>{t('profile.usernameLabel')}</Text>
          <TextInput
            style={styles.input}
            value={draft.name}
            onChangeText={(name) => setDraft((prev) => ({ ...prev, name }))}
            placeholder={t('profile.usernamePlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            maxLength={24}
          />

          <Text style={styles.label}>{t('profile.genderLabel')}</Text>
          <View style={styles.genderRow}>
            {USER_GENDER_OPTIONS.map((option) => {
              const selected = draft.gender === option;
              const ui = GENDER_UI[option];
              const optionLabel =
                option === '男性'
                  ? t('profile.genderMale')
                  : t('profile.genderFemale');
              return (
                <Pressable
                  key={option}
                  style={[
                    styles.genderOption,
                    selected
                      ? {
                          backgroundColor: ui.soft,
                          borderColor: ui.accent,
                        }
                      : styles.genderOptionIdle,
                  ]}
                  onPress={() => selectGender(option)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={optionLabel}
                >
                  <MaterialCommunityIcons
                    name={ui.icon}
                    size={22}
                    color={selected ? ui.accent : theme.colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.genderLabel,
                      {
                        color: selected
                          ? ui.accent
                          : theme.colors.textSecondary,
                      },
                    ]}
                  >
                    {optionLabel}
                  </Text>
                </Pressable>
              );
            })}
          </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  cancel: {
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
  },
  save: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  saveDisabled: {
    opacity: 0.45,
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
  input: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: 16,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  genderOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  genderOptionIdle: {
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.border,
  },
  genderLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
