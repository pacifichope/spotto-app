import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import SnsBrandIcon from '@/components/SnsBrandIcon';
import { theme } from '@/constants/theme';
import {
  openSnsLink,
  snsKindMeta,
  type SnsLink,
} from '@/lib/snsLinks';

type SnsLinksRowProps = {
  links: SnsLink[];
  /** コンパクト（主催カード内）か通常（クラブプロフィール）か */
  size?: 'md' | 'lg';
};

export default function SnsLinksRow({ links, size = 'lg' }: SnsLinksRowProps) {
  const { t } = useTranslation();
  if (!links.length) return null;
  const iconSize = size === 'lg' ? 44 : 36;

  return (
    <View style={styles.row}>
      {links.map((link) => {
        const meta = snsKindMeta(link.kind);
        const label =
          link.kind === 'web' ? t('organizer.snsWeb') : meta.label;
        return (
          <Pressable
            key={link.id}
            style={({ pressed }) => [
              styles.item,
              pressed && styles.itemPressed,
            ]}
            onPress={() => {
              void (async () => {
                const ok = await openSnsLink(link.url);
                if (!ok) {
                  Alert.alert(
                    t('sns.openFailedTitle'),
                    t('sns.openFailedBody'),
                  );
                }
              })();
            }}
            accessibilityRole="link"
            accessibilityLabel={t('sns.openA11y', { label })}
          >
            <View style={styles.iconShadow}>
              <SnsBrandIcon kind={link.kind} size={iconSize} />
            </View>
            <Text style={styles.label} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    alignItems: 'flex-start',
  },
  item: {
    width: 68,
    alignItems: 'center',
    gap: 6,
  },
  itemPressed: {
    opacity: 0.72,
  },
  iconShadow: {
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    borderRadius: 999,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
