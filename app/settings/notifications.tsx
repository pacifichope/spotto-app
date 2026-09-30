import { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SettingsHeader from '@/components/SettingsHeader';
import { theme } from '@/constants/theme';
import { openAppSettings } from '@/lib/openAppSettings';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_PREF_ROWS,
  ensureNotificationPermission,
  loadNotificationSettings,
  saveNotificationSettings,
  type NotificationPreferenceKey,
  type NotificationSettings,
} from '@/lib/notificationSettings';
import { registerDevicePushToken } from '@/lib/pushNotifications';

export default function NotificationSettingsScreen() {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  );
  const [ready, setReady] = useState(false);
  const [pendingKey, setPendingKey] = useState<NotificationPreferenceKey | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    loadNotificationSettings().then((loaded) => {
      if (cancelled) return;
      setSettings(loaded);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const apply = async (next: NotificationSettings) => {
    setSettings(next);
    await saveNotificationSettings(next);
  };

  const handleToggle = async (
    key: NotificationPreferenceKey,
    enabled: boolean,
  ) => {
    if (!ready || pendingKey) return;

    if (!enabled) {
      await apply({ ...settings, [key]: false });
      return;
    }

    setPendingKey(key);
    const result = await ensureNotificationPermission();
    if (result.ok) {
      await apply({ ...settings, [key]: true });
      void registerDevicePushToken().catch(() => undefined);
    } else if (result.reason === 'denied') {
      Alert.alert(
        '通知が許可されていません',
        '「設定を開く」を押すと、このアプリの個別設定が開きます。通知を許可してください。',
        [
          { text: '閉じる', style: 'cancel' },
          {
            text: '設定を開く',
            onPress: () => {
              void openAppSettings();
            },
          },
        ],
      );
    } else {
      Alert.alert(
        '通知を利用できません',
        'この環境ではプッシュ通知の許可を取得できません。iOS / Android のアプリでお試しください。',
      );
    }
    setPendingKey(null);
  };

  return (
    <View style={styles.root}>
      <SettingsHeader title="通知設定" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
      >
        <View style={styles.card}>
          {NOTIFICATION_PREF_ROWS.map((row, index) => (
            <View
              key={row.key}
              style={[styles.row, index > 0 && styles.rowBorder]}
            >
              <View style={styles.rowText}>
                <Text style={styles.label}>{row.label}</Text>
                <Text style={styles.caption}>{row.caption}</Text>
              </View>
              <Switch
                value={settings[row.key]}
                onValueChange={(value) => {
                  void handleToggle(row.key, value);
                }}
                disabled={!ready || pendingKey !== null}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#E5E7EB"
                accessibilityLabel={row.label}
              />
            </View>
          ))}
        </View>
        <Text style={styles.hint}>
          {Platform.OS === 'web'
            ? '設定はこのブラウザに保存されます。プッシュ通知の許可ダイアログは iOS / Android アプリで表示されます。'
            : '初めて通知をオンにすると、端末の通知許可が求められます。許可後も種類ごとに切り替えられます。'}
        </Text>
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
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  row: {
    minHeight: 64,
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
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  caption: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  hint: {
    marginTop: 12,
    marginHorizontal: 4,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
});
