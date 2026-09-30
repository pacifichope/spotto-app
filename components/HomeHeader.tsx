import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import HeaderRoundButton from '@/components/HeaderRoundButton';
import { MapPinIcon, SearchIcon } from '@/components/icons';
import { theme } from '@/constants/theme';

type HomeHeaderProps = {
  areaLabel?: string;
  query: string;
  onChangeQuery: (text: string) => void;
  onPressArea?: () => void;
  onPressMap?: () => void;
};

export default function HomeHeader({
  areaLabel = '現在地を取得中…',
  query,
  onChangeQuery,
  onPressArea,
  onPressMap,
}: HomeHeaderProps) {
  return (
    <View style={styles.row}>
      <Pressable
        style={styles.area}
        onPress={onPressArea}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`エリア ${areaLabel}`}
      >
        <Text style={styles.areaText} numberOfLines={1}>
          {areaLabel}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <View style={styles.search}>
        <SearchIcon size={15} color={theme.colors.textMuted} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={onChangeQuery}
          placeholder="イベント・スポーツを検索"
          placeholderTextColor={theme.colors.textMuted}
          returnKeyType="search"
        />
      </View>

      {onPressMap ? (
        <HeaderRoundButton
          onPress={onPressMap}
          accessibilityLabel="地図を表示"
        >
          <MapPinIcon size={20} color={theme.colors.onPrimary} />
        </HeaderRoundButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  area: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    maxWidth: 148,
    paddingVertical: 4,
  },
  areaText: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: theme.colors.text,
  },
  chevron: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 1,
  },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 42,
    gap: 8,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
    paddingVertical: 0,
  },
});
