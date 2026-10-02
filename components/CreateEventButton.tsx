import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';

import BrandGradient from '@/components/BrandGradient';
import { theme } from '@/constants/theme';

type CreateEventButtonProps = {
  onPress: () => void;
};

/** ブランドグラデーション FAB（白の +） */
export default function CreateEventButton({ onPress }: CreateEventButtonProps) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('create.fabA11y')}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      onPress={onPress}
    >
      <BrandGradient style={styles.fab}>
        <Text style={styles.plus}>+</Text>
      </BrandGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 29,
    shadowColor: theme.colors.accentDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 10,
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.96 }],
  },
  plus: {
    color: theme.colors.onPrimary,
    fontSize: 34,
    fontWeight: '700',
    marginTop: -2,
  },
});
