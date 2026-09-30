import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  const { userProfile, updateUserProfile } = useUserProfile();
  const { isLoggedIn, user, openLogin, signOut, deleteAccount } = useAuth();
  const { blockedUsers } = useBlocks();
  const [profileVisible, setProfileVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const onPressLogout = () => {
    if (!isLoggedIn) {
      openLogin();
      return;
    }
    const performLogout = () => {
      signOut();
      router.replace('/');
      // 画面遷移後も確実に見えるよう Alert で通知
      setTimeout(() => {
        Alert.alert('ログアウトしました');
      }, 100);
    };
    if (Platform.OS === 'web') {
      performLogout();
      return;
    }
    Alert.alert('ログアウト', 'この端末からログアウトしますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'ログアウト',
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
      Alert.alert('削除できませんでした', result.error);
      return;
    }
    const title = 'アカウントを削除しました';
    const message =
      'データは削除され、ログアウトしました。イベントの閲覧はゲストのまま続けられます。';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
    router.replace('/');
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

  const rows: Row[] = [
    {
      key: 'profile',
      label: 'プロフィール編集',
      onPress: () => {
        if (!isLoggedIn) {
          openLogin();
          return;
        }
        setProfileVisible(true);
      },
    },
    {
      key: 'notifications',
      label: '通知設定',
      caption: 'リマインダー・メッセージなど',
      onPress: () => router.push('/settings/notifications'),
    },
    {
      key: 'blocklist',
      label: 'ブロックリスト',
      caption:
        blockedUsers.length > 0
          ? `${blockedUsers.length}人をブロック中`
          : 'ブロック中のユーザーはいません',
      onPress: () => router.push('/settings/blocklist'),
    },
    {
      key: 'contact',
      label: 'お問い合わせ',
      caption: '不具合・ご質問は運営へ',
      onPress: () => router.push('/settings/contact'),
    },
    {
      key: 'terms',
      label: '利用規約',
      caption: 'サービスの利用条件',
      external: true,
      onPress: () => {
        void Linking.openURL(LEGAL_EXTERNAL_URLS.terms);
      },
    },
    {
      key: 'privacy',
      label: 'プライバシーポリシー',
      caption: '個人情報の取り扱い',
      external: true,
      onPress: () => {
        void Linking.openURL(LEGAL_EXTERNAL_URLS.privacy);
      },
    },
    {
      key: 'tokushoho',
      label: '特定商取引法に基づく表記',
      caption: '運営者情報・支払・キャンセル',
      external: true,
      onPress: () => {
        void Linking.openURL(LEGAL_EXTERNAL_URLS.tokushoho);
      },
    },
    {
      key: 'delete',
      label: 'アカウントを削除',
      caption: isLoggedIn
        ? '退会するとデータは削除されます'
        : 'ログイン中のアカウントのみ削除できます',
      tone: 'danger',
      busy: deleting,
      disabled: deleting,
      onPress: onPressDelete,
    },
  ];

  return (
    <View style={styles.root}>
      <SettingsHeader title="設定" />
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
              accessibilityLabel="ログアウト"
              style={styles.logoutLink}
            >
              <Text style={styles.logoutLinkText}>ログアウト</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => openLogin()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="ログイン"
              style={styles.logoutLink}
            >
              <Text style={styles.loginLinkText}>ログイン</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <PersonalProfileModal
        visible={profileVisible}
        profile={isLoggedIn ? userProfile : { name: '', gender: '', imageUri: undefined }}
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
                const msg = result.error || 'プロフィールをサーバーに保存できませんでした。';
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.alert(`保存できませんでした\n\n${msg}`);
                } else {
                  Alert.alert('保存できませんでした', msg);
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
