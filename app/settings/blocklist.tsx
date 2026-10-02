import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HostAvatar from '@/components/HostAvatar';
import { BlockEmptyIcon, EmptyStateIcon } from '@/components/icons';
import SettingsHeader from '@/components/SettingsHeader';
import { theme } from '@/constants/theme';
import { confirmUnblockUser } from '@/lib/blocks';
import { useBlocks } from '@/lib/blocksContext';

export default function BlocklistScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { blockedUsers, unblockUser } = useBlocks();

  return (
    <View style={styles.root}>
      <SettingsHeader title={t('settings.blocklist')} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 28) },
          blockedUsers.length === 0 && styles.contentEmpty,
        ]}
      >
        {blockedUsers.length === 0 ? (
          <View style={styles.empty}>
            <EmptyStateIcon>
              <BlockEmptyIcon size={28} />
            </EmptyStateIcon>
            <Text style={styles.emptyTitle}>
              {t('settings.blocklistEmptyTitle')}
            </Text>
            <Text style={styles.emptyBody}>
              {t('settings.blocklistEmptyBody')}
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            {blockedUsers.map((user, index) => (
              <View
                key={user.id}
                style={[styles.row, index > 0 && styles.rowBorder]}
              >
                <HostAvatar
                  name={user.name}
                  imageUri={user.imageUri}
                  size={44}
                />
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>
                    {user.name}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {user.bio?.trim() || t('settings.blockedLabel')}
                  </Text>
                </View>
                <Pressable
                  style={styles.unblockBtn}
                  onPress={() =>
                    confirmUnblockUser(user.name, () => {
                      void unblockUser(user.id);
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={t('settings.unblockA11y', { name: user.name })}
                >
                  <Text style={styles.unblockText}>{t('settings.unblock')}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
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
  contentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  unblockBtn: {
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
  },
  unblockText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.text,
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
