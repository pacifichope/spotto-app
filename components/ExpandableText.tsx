import { useEffect, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { theme } from '@/constants/theme';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DEFAULT_COLLAPSED_LINES = 6;

type ExpandableTextProps = {
  text: string;
  collapsedLines?: number;
  style?: StyleProp<TextStyle>;
  expandLabel?: string;
  collapseLabel?: string;
};

export default function ExpandableText({
  text,
  collapsedLines = DEFAULT_COLLAPSED_LINES,
  style,
  expandLabel = '続きを読む',
  collapseLabel = '折りたたむ',
}: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);
  const [measured, setMeasured] = useState(false);

  useEffect(() => {
    setExpanded(false);
    setNeedsToggle(false);
    setMeasured(false);
  }, [text, collapsedLines]);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((current) => !current);
  };

  if (!text) return null;

  const collapsed = !measured || (needsToggle && !expanded);

  return (
    <View style={styles.wrap}>
      {/* 行数計測用（レイアウトに影響させない） */}
      {!measured ? (
        <Text
          style={[styles.body, style, styles.hiddenMeasure]}
          onTextLayout={(e) => {
            setNeedsToggle(e.nativeEvent.lines.length > collapsedLines);
            setMeasured(true);
          }}
        >
          {text}
        </Text>
      ) : null}
      <Text
        style={[styles.body, style]}
        numberOfLines={collapsed ? collapsedLines : undefined}
        ellipsizeMode="tail"
      >
        {text}
      </Text>
      {measured && needsToggle ? (
        <Pressable
          onPress={toggle}
          hitSlop={8}
          style={styles.toggle}
          accessibilityRole="button"
          accessibilityLabel={expanded ? collapseLabel : expandLabel}
          accessibilityState={{ expanded }}
        >
          <Text style={styles.toggleLabel}>
            {expanded ? collapseLabel : expandLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    color: theme.colors.text,
  },
  hiddenMeasure: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    right: 0,
    zIndex: -1,
  },
  toggle: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingVertical: 2,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.primary,
  },
});
