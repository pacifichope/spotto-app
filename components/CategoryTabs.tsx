import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import BrandGradient from '@/components/BrandGradient';
import { theme } from '@/constants/theme';
import { CATEGORIES, OTHER_SPORT_LABEL, type CategoryId } from '@/lib/events';

/** カテゴリ ID（データ上の識別子）→ 翻訳キー */
const CATEGORY_LABEL_KEYS: Record<string, string> = {
  all: 'all',
  hot: 'hot',
  サッカー: 'soccer',
  バスケットボール: 'basketball',
  テニス: 'tennis',
  ランニング: 'running',
  フットサル: 'futsal',
  バドミントン: 'badminton',
  バレーボール: 'volleyball',
  [OTHER_SPORT_LABEL]: 'other',
};

type CategoryTabsProps = {
  activeId: CategoryId;
  onChange: (id: CategoryId) => void;
};

export default function CategoryTabs({ activeId, onChange }: CategoryTabsProps) {
  const { t } = useTranslation();
  const labelFor = (cat: (typeof CATEGORIES)[number]) => {
    const key = CATEGORY_LABEL_KEYS[cat.id];
    return key
      ? t(`home.categories.${key}`, { defaultValue: cat.label })
      : cat.label;
  };
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {CATEGORIES.map((cat) => {
        const active = cat.id === activeId;
        return (
          <Pressable
            key={cat.id}
            onPress={() => {
              if (cat.id === activeId && cat.id !== 'all') {
                onChange('all');
                return;
              }
              onChange(cat.id);
            }}
            style={styles.tab}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={
              active && cat.id !== 'all'
                ? t('home.categoryClearA11y', { category: labelFor(cat) })
                : labelFor(cat)
            }
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {labelFor(cat)}
            </Text>
            {active ? <BrandGradient style={styles.marker} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    gap: 18,
    paddingVertical: 4,
    alignItems: 'flex-end',
  },
  tab: {
    position: 'relative',
    paddingBottom: 6,
    minWidth: 28,
    alignItems: 'center',
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: -0.2,
    zIndex: 1,
  },
  labelActive: {
    color: theme.colors.text,
    fontWeight: '800',
  },
  marker: {
    position: 'absolute',
    left: -2,
    right: -2,
    bottom: 2,
    height: 9,
    borderRadius: 4,
    overflow: 'hidden',
    zIndex: 0,
  },
});
