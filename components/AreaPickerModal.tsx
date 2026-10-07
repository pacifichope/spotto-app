import AppModal from '@/components/AppModal';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';
import {
  prefectureDisplayLabel,
  prefectureGroupDisplayTitle,
} from '@/lib/areaLabels';
import {
  PREFECTURE_GROUPS,
  getPrefectureById,
  type AreaSelection,
} from '@/lib/areas';

type AreaPickerModalProps = {
  visible: boolean;
  selection: AreaSelection | null;
  locating?: boolean;
  onClose: () => void;
  onSelectNearby: () => void;
  onSelectPrefecture: (prefectureId: string) => void;
};

export default function AreaPickerModal({
  visible,
  selection,
  locating = false,
  onClose,
  onSelectNearby,
  onSelectPrefecture,
}: AreaPickerModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nearbySelected = selection?.mode === 'nearby';
  const selectedPrefectureId =
    selection?.mode === 'prefecture' ? selection.prefectureId : null;

  return (
    <AppModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top || 8 }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.headerSide}>
            <Text style={styles.cancel}>{t('common.cancel')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('areas.pickerTitle')}</Text>
          <View style={styles.headerSide} />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.list,
            { paddingBottom: Math.max(insets.bottom, 24) },
          ]}
        >
          <Pressable
            style={[styles.item, nearbySelected && styles.itemSelected]}
            onPress={onSelectNearby}
            disabled={locating}
          >
            <Text style={styles.itemLabel}>{t('areas.nearby')}</Text>
            {locating ? (
              <ActivityIndicator color={theme.colors.primaryDark} />
            ) : nearbySelected ? (
              <Text style={styles.check}>✓</Text>
            ) : null}
          </Pressable>

          {PREFECTURE_GROUPS.map((group, groupIndex) => (
            <View key={group.title}>
              <Text style={styles.section}>
                {prefectureGroupDisplayTitle(groupIndex, group.title)}
              </Text>
              {group.ids.map((id) => {
                const prefecture = getPrefectureById(id);
                const selected = selectedPrefectureId === prefecture.id;
                return (
                  <Pressable
                    key={prefecture.id}
                    style={[styles.item, selected && styles.itemSelected]}
                    onPress={() => onSelectPrefecture(prefecture.id)}
                  >
                    <Text style={styles.itemLabel}>
                      {prefectureDisplayLabel(prefecture.id)}
                    </Text>
                    {selected ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  headerSide: {
    minWidth: 72,
  },
  cancel: {
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  section: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceAlt,
    marginBottom: 8,
  },
  itemSelected: {
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  itemLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  check: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.primaryDark,
  },
});
