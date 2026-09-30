import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';
import { SORT_OPTIONS, type SortKey } from '@/lib/eventBrowse';

type SortPickerModalProps = {
  visible: boolean;
  sortKey: SortKey;
  onClose: () => void;
  onSelect: (key: SortKey) => void;
};

export default function SortPickerModal({
  visible,
  sortKey,
  onClose,
  onSelect,
}: SortPickerModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>並び替え</Text>
          <Text style={styles.subtitle}>一覧の表示順を選べます</Text>
          {SORT_OPTIONS.map((option) => {
            const selected = option.key === sortKey;
            return (
              <Pressable
                key={option.key}
                style={[styles.item, selected && styles.itemSelected]}
                onPress={() => {
                  onSelect(option.key);
                  onClose();
                }}
              >
                <View style={styles.itemBody}>
                  <Text style={styles.itemLabel}>{option.label}</Text>
                  <Text style={styles.itemHint}>{option.hint}</Text>
                </View>
                {selected ? <Text style={styles.check}>✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  sheet: {
    zIndex: 1,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.border,
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceAlt,
    gap: 12,
  },
  itemSelected: {
    backgroundColor: theme.colors.primarySoft,
  },
  itemBody: {
    flex: 1,
    gap: 2,
  },
  itemLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
  },
  itemHint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  check: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.primaryDark,
  },
});
