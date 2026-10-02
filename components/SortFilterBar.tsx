import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import BrandGradient, { brandGradientFill } from '@/components/BrandGradient';
import { theme } from '@/constants/theme';
import { sortLabel, type SortKey } from '@/lib/eventBrowse';

type SortFilterBarProps = {
  sortKey: SortKey;
  filterCount: number;
  onPressSort: () => void;
  onPressFilter: () => void;
  count: number;
  /** エリアモードに応じたキャプション */
  areaMode?: 'nearby' | 'prefecture' | null;
  prefectureLabel?: string | null;
};

export default function SortFilterBar({
  sortKey,
  filterCount,
  onPressSort,
  onPressFilter,
  count,
  areaMode = null,
  prefectureLabel = null,
}: SortFilterBarProps) {
  const { t } = useTranslation();
  const filterActive = filterCount > 0;
  const caption =
    areaMode === 'prefecture' && prefectureLabel
      ? t('home.captionPrefecture', { area: prefectureLabel, count })
      : areaMode === 'nearby'
        ? t('home.captionNearby', { count })
        : t('home.caption', { count });

  return (
    <View style={styles.row}>
      <Text style={styles.caption}>{caption}</Text>
      <View style={styles.right}>
        <Pressable style={styles.iconBtn} onPress={onPressSort} hitSlop={8}>
          <Text style={styles.sortText} numberOfLines={1}>
            {sortLabel(sortKey)}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.iconBtn, filterActive && styles.iconBtnActive]}
          onPress={onPressFilter}
          hitSlop={8}
          accessibilityLabel={t('home.filter.title')}
        >
          {filterActive ? (
            <BrandGradient style={[brandGradientFill, styles.iconBtnFill]} />
          ) : null}
          <Ionicons
            name="options-outline"
            size={18}
            color={filterActive ? theme.colors.onPrimary : theme.colors.textSecondary}
            style={styles.iconForeground}
          />
          {filterActive ? (
            <View style={[styles.badge, styles.iconForeground]}>
              <Text style={styles.badgeText}>{filterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  caption: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    overflow: 'hidden',
  },
  iconBtnActive: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  iconBtnFill: {
    borderRadius: 999,
  },
  iconForeground: {
    zIndex: 1,
  },
  sortText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text,
  },
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.accentDark,
  },
});
