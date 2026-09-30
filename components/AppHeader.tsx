import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';

type AppHeaderProps = {
  locationLabel?: string;
};

export default function AppHeader({
  locationLabel = '現在地を取得中…',
}: AppHeaderProps) {
  return (
    <View style={styles.row}>
      <View>
        <Text style={styles.brand}>spotto</Text>
        <Text style={styles.location}>{locationLabel}</Text>
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>LIVE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  location: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  badge: {
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.primaryDark,
    letterSpacing: 0.6,
  },
});
