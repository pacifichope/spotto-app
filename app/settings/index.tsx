import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PersonalProfileModal from '@/components/PersonalProfileModal';
import SettingsHeader from '@/components/SettingsHeader';
import { ChevronRightIcon, ExternalLinkIcon } from '@/components/icons';
import { theme } from '@/constants/theme';
import { confirmDeleteAccount } from '@/lib/accountDeletion';
import { useAuth } from '@/lib/authContext';
import { useBlocks } from '@/lib/blocksContext';
import { getCurrentAppLanguage } from '@/lib/i18n';
import { LEGAL_EXTERNAL_URLS } from '@/lib/settings';
import { useUserProfile } from '@/lib/userProfileContext';
import { setActiveProfileUserId } from '@/lib/userProfile';
import { pushProfileToRemote } from '@/lib/userProfileRemote';

/** リスト内の削除行用（強すぎない赤みグレー） */
const DELETE_LABEL = '#A35D5D';
const DELETE_CAPTION = '#9A7A7A';

type Row = {
  key: string;
  label: string;
  caption?: string;
  /** true のとき外部ブラウザ遷移（斜め矢印アイコン） */
  external?: boolean;
  tone?: 'default' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const language = getCurrentAppLanguage();
  const { userProfile, updateUserProfile } = useUserProfile();
  const { isLoggedIn, user, openLogin, signOut, deleteAccount, accountDataReady } =
    useAuth();
  const { blockedUsers } = useBlocks();
  const [profileVisible, setProfileVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const onPressLogout = () => {
    if (!isLoggedIn) {
      openLogin();
      return;
    }
    const performLogout = () => {
      setProfileVisible(false);
      try {
        signOut();
      } catch (error) {
        if (__DEV__) console.warn('[settings] logout', error);
      }
      // 確認アラートの dismiss と同時に replace すると iOS が落ちる。
      // ローカル状態を消したあと、遷移だけを次のターンで行う。
      InteractionManager.runAfterInteractions(() => {
        router.replace('/(tabs)/home');
      });
    };
    if (Platform.OS === 'web') {
      performLogout();
      return;
    }
    Alert.alert(t('settings.logoutConfirmTitle'), t('settings.logoutConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.logout'),
        style: 'destructive',
        onPress: performLogout,
      },
    ]);
  };

  const finishDeletion = async () => {
    if (deleting) return;
    setDeleting(true);
    const result = await deleteAccount();
    setDeleting(false);
    if (!result.ok) {
      Alert.alert(t('settings.deleteFailedTitle'), result.error);
      return;
    }
    const title = t('settings.deleteDoneTitle');
    const message = t('settings.deleteDoneMessage');
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
      router.replace('/(tabs)/home');
      return;
    }
    Alert.alert(title, message, [
      {
        text: t('common.ok'),
        onPress: () => {
          InteractionManager.runAfterInteractions(() => {
            router.replace('/(tabs)/home');
          });
        },
      },
    ]);
  };

  const onPressDelete = () => {
    if (!isLoggedIn) {
      openLogin();
      return;
    }
    if (deleting) return;
    confirmDeleteAccount(() => {
      void finishDeletion();
    });
  };

  const languageCaption =
    language === 'en'
      ? t('settings.languageEnglish')
      : t('settings.languageJapanese');

  const rows: Row[] = [
    {
      key: 'profile',
      label: t('settings.profile'),
      onPress: () => {
        if (!isLoggedIn) {
          openLogin();
          return;
        }
        setProfileVisible(true);
      },
    },
    {
      key: 'language',
      label: t('settings.language'),
      caption: languageCaption,
      onPress: () => router.push('/settings/language'),
    },
    {
      key: 'notifications',
      label: t('settings.notifications'),
      caption: t('settings.notificationsCaption'),
      onPress: () => router.push('/settings/notifications'),
    },
    {
      key: 'blocklist',
      label: t('settings.blocklist'),
      caption:
        blockedUsers.length > 0
          ? t('settings.blocklistCaptionCount', { count: blockedUsers.length })
          : t('settings.blocklistCaptionEmpty'),
      onPress: () => router.push('/settings/blocklist'),
    },
    {
      key: 'contact',
      label: t('settings.contact'),
      caption: t('settings.contactCaption'),
      onPress: () => router.push('/settings/contact'),
    },
    {
      key: 'terms',
      label: t('settings.terms'),
      caption: t('settings.termsCaption'),
      external: true,
      onPress: () => {
        void Linking.openURL(LEGAL_EXTERNAL_URLS.terms);
      },
    },
    {
      key: 'privacy',
      label: t('settings.privacy'),
      caption: t('settings.privacyCaption'),
      external: true,
      onPress: () => {
        void Linking.openURL(LEGAL_EXTERNAL_URLS.privacy);
      },
    },
    {
      key: 'tokushoho',
      label: t('settings.tokushoho'),
      caption: t('settings.tokushohoCaption'),
      external: true,
      onPress: () => {
        void Linking.openURL(LEGAL_EXTERNAL_URLS.tokushoho);
      },
    },
    {
      key: 'delete',
      label: t('settings.deleteAccount'),
      caption: isLoggedIn
        ? t('settings.deleteAccountCaptionLoggedIn')
        : t('settings.deleteAccountCaptionGuest'),
      tone: 'danger',
      busy: deleting,
      disabled: deleting,
      onPress: onPressDelete,
    },
  ];

  return (
    <View style={styles.root}>
      <SettingsHeader title={t('settings.title')} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 28) },
        ]}
      >
        <View style={styles.card}>
          {rows.map((row, index) => {
            const danger = row.tone === 'danger';
            return (
              <Pressable
                key={row.key}
                onPress={row.onPress}
                disabled={row.disabled}
                accessibilityRole="button"
                accessibilityLabel={row.label}
                accessibilityState={{ disabled: Boolean(row.disabled) }}
                style={[
                  styles.row,
                  index > 0 && styles.rowBorder,
                  row.disabled && styles.rowDisabled,
                ]}
              >
                <View style={styles.rowText}>
                  <Text
                    style={[styles.label, danger && styles.labelDanger]}
                  >
                    {row.label}
                  </Text>
                  {row.caption ? (
                    <Text
                      style={[styles.caption, danger && styles.captionDanger]}
                      numberOfLines={1}
                    >
                      {row.caption}
                    </Text>
                  ) : null}
                </View>
                {row.busy ? (
                  <ActivityIndicator color={DELETE_LABEL} />
                ) : row.external ? (
                  <ExternalLinkIcon size={18} color={theme.colors.textMuted} />
                ) : (
                  <ChevronRightIcon
                    size={20}
                    color={danger ? DELETE_CAPTION : theme.colors.textMuted}
                  />
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.accountActions}>
          {isLoggedIn ? (
            <Pressable
              onPress={onPressLogout}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('settings.logout')}
              style={styles.logoutLink}
            >
              <Text style={styles.logoutLinkText}>{t('settings.logout')}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => openLogin()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('settings.login')}
              style={styles.logoutLink}
            >
              <Text style={styles.loginLinkText}>{t('settings.login')}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <PersonalProfileModal
        visible={profileVisible}
        profile={
          isLoggedIn && accountDataReady
            ? userProfile
            : { name: '', gender: '', imageUri: undefined }
        }
        onClose={() => setProfileVisible(false)}
        onSave={(next) => {
          if (user?.id) {
            setActiveProfileUserId(user.id);
          }
          updateUserProfile(next);
          setProfileVisible(false);
          if (user?.id) {
            void (async () => {
              const result = await pushProfileToRemote(user.id, next);
              if (!result.ok) {
                const msg = result.error || t('common.profileSaveFailedBody');
                const failTitle = t('common.saveFailedShort');
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.alert(`${failTitle}\n\n${msg}`);
                } else {
                  Alert.alert(failTitle, msg);
                }
              }
            })();
          }
        }}
      />
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
    gap: 28,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  row: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  labelDanger: {
    color: DELETE_LABEL,
    fontWeight: '600',
  },
  caption: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  captionDanger: {
    color: DELETE_CAPTION,
    fontWeight: '500',
  },
  accountActions: {
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 4,
  },
  logoutLink: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  logoutLinkText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.danger,
  },
  loginLinkText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.primaryDark,
  },
});
