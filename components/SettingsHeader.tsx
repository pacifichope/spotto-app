import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';

type SettingsHeaderProps = {
  title: string;
  /** 背景を透過して下のグラデーションなどを見せる */
  transparent?: boolean;
};

export default function SettingsHeader({
  title,
  transparent = false,
}: SettingsHeaderProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const back = () => {
    if (router.canGoBack?.()) {
      router.back?.();
      return;
    }
    router.replace?.('/(tabs)/mypage');
  };

  return (
    <View
      style={[
        styles.header,
        transparent && styles.headerTransparent,
        { paddingTop: Math.max(insets.top, 8) },
      ]}
    >
      <Pressable
        onPress={back}
        hitSlop={12}
        style={styles.side}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
      >
        <SymbolView
          name={{
            ios: 'chevron.left',
            android: 'chevron_left',
            web: 'chevron_left',
          }}
          tintColor={theme.colors.text}
          size={26}
          fallback={<Text style={styles.fallback}>‹</Text>}
        />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.side} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
    backgroundColor: theme.colors.surfaceAlt,
    zIndex: 2,
  },
  headerTransparent: {
    backgroundColor: 'transparent',
  },
  side: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },
  fallback: {
    fontSize: 28,
    lineHeight: 32,
    color: theme.colors.text,
    marginTop: -2,
  },
});
