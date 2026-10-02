import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const COLLAPSED_LINES = 5;

type EventContentSectionProps = {
  text: string;
};

/** Activity Details — 折りたたみ可能なイベント内容セクション。 */
export default function EventContentSection({
  text,
}: EventContentSectionProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const body = useMemo(
    () =>
      String(text || '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    [text],
  );
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);
  const [measured, setMeasured] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);

  useEffect(() => {
    setExpanded(false);
    setNeedsToggle(false);
    setMeasured(false);
    setFullOpen(false);
  }, [body]);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  if (!body) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Activity Details</Text>
        <View style={styles.card}>
          <Text style={styles.empty}>
            {t('events.contentEmpty')}
          </Text>
        </View>
      </View>
    );
  }

  const collapsed = measured && needsToggle && !expanded;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Activity Details</Text>

      <View style={styles.card}>
        {!measured ? (
          <Text
            style={[styles.body, styles.hiddenMeasure]}
            onTextLayout={(e) => {
              setNeedsToggle(e.nativeEvent.lines.length > COLLAPSED_LINES);
              setMeasured(true);
            }}
          >
            {body}
          </Text>
        ) : null}
        <Text
          style={styles.body}
          numberOfLines={collapsed ? COLLAPSED_LINES : undefined}
          ellipsizeMode="tail"
        >
          {body}
        </Text>

        {measured && needsToggle ? (
          <Pressable
            onPress={toggle}
            onLongPress={() => setFullOpen(true)}
            style={({ pressed }) => [
              styles.expandBtn,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={expanded ? t('common.collapse') : t('common.expand')}
          >
            <Text style={styles.expandText}>
              {expanded ? 'Collapse' : 'Expand'}
            </Text>
            <Feather
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="#16A34A"
            />
          </Pressable>
        ) : null}
      </View>

      <Modal
        visible={fullOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setFullOpen(false)}
      >
        <View style={[styles.fullRoot, { paddingTop: insets.top || 8 }]}>
          <View style={styles.fullHeader}>
            <Text style={styles.fullTitle}>Activity Details</Text>
            <Pressable
              onPress={() => setFullOpen(false)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Text style={styles.fullClose}>{t('common.close')}</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={[
              styles.fullBody,
              { paddingBottom: Math.max(insets.bottom, 28) },
            ]}
          >
            <Text style={styles.body}>{body}</Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.4,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#F4F5F7',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  body: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 24,
    color: theme.colors.text,
  },
  hiddenMeasure: {
    position: 'absolute',
    opacity: 0,
    zIndex: -1,
    left: 16,
    right: 16,
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    marginTop: 4,
  },
  expandText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#16A34A',
  },
  pressed: {
    opacity: 0.7,
  },
  empty: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: theme.colors.textMuted,
    paddingBottom: 6,
  },
  fullRoot: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  fullHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  fullTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },
  fullClose: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  fullBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
});
