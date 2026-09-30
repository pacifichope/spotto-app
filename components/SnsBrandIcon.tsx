import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  InstagramGlyphMark,
  LineSpeechMark,
  WebsiteGlobeMark,
  XLogoMark,
} from '@/components/socialBrandMarks';
import { snsKindMeta, type SnsKind } from '@/lib/snsLinks';

type SnsBrandIconProps = {
  kind: SnsKind;
  /** 円バッジの直径 */
  size?: number;
};

const INSTAGRAM_GRADIENT = ['#F58529', '#DD2A7B', '#8134AF', '#515BD4'] as const;

/**
 * SNS / Web の公式ブランドアイコンを円バッジで表示。
 * Instagram はグラデーション背景＋白グリフ、他はブランド色背景。
 */
export default function SnsBrandIcon({ kind, size = 44 }: SnsBrandIconProps) {
  const meta = snsKindMeta(kind);
  const px = Math.max(24, Math.round(size));
  const glyph =
    kind === 'instagram'
      ? Math.round(px * 0.48)
      : kind === 'x'
        ? Math.round(px * 0.42)
        : kind === 'line'
          ? Math.round(px * 0.58)
          : Math.round(px * 0.48);

  const mark =
    kind === 'instagram' ? (
      <InstagramGlyphMark size={glyph} color="#FFFFFF" />
    ) : kind === 'x' ? (
      <XLogoMark size={glyph} color="#FFFFFF" />
    ) : kind === 'line' ? (
      <LineSpeechMark size={glyph} color="#FFFFFF" />
    ) : (
      <WebsiteGlobeMark size={glyph} color="#FFFFFF" />
    );

  if (kind === 'instagram') {
    return (
      <LinearGradient
        colors={[...INSTAGRAM_GRADIENT]}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.badge,
          {
            width: px,
            height: px,
            borderRadius: px / 2,
          },
        ]}
      >
        {mark}
      </LinearGradient>
    );
  }

  return (
    <View
      style={[
        styles.badge,
        {
          width: px,
          height: px,
          borderRadius: px / 2,
          backgroundColor: meta.color,
        },
      ]}
    >
      {mark}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
