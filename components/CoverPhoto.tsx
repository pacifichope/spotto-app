import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useEffect, useState, type ReactNode } from 'react';

import { sportFallbackUri } from '@/lib/events';
import { resolveDisplayImageUrl } from '@/lib/storage';

type CoverPhotoProps = {
  uri?: string;
  fallbackUri?: string;
  /** スポーツ名など。フォールバック画像の選択に使う */
  sport?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/**
 * カバー／バナー用画像。
 * - Storage 相対パス（events/...）は公開 URL に正規化
 * - 読込失敗時は fallback → スポーツ用ダミー画像へ段階フォールバック
 * - すべて失敗しても灰色背景でクラッシュしない
 *
 * Supabase Storage は公開バケット（public）前提。authenticated 経路の URL は
 * resolvePublicImageUrl 側で /object/public/ に寄せる。
 */
export default function CoverPhoto({
  uri,
  fallbackUri,
  sport,
  style,
  children,
}: CoverPhotoProps) {
  const placeholder = sportFallbackUri(sport);
  const resolvedPrimary = resolveDisplayImageUrl(uri);
  const resolvedFallback = resolveDisplayImageUrl(fallbackUri);

  const [stage, setStage] = useState<'primary' | 'fallback' | 'placeholder'>(
    'primary',
  );

  useEffect(() => {
    setStage('primary');
  }, [resolvedPrimary, resolvedFallback, placeholder]);

  const src =
    stage === 'primary' && resolvedPrimary
      ? resolvedPrimary
      : stage === 'fallback' &&
          resolvedFallback &&
          resolvedFallback !== resolvedPrimary
        ? resolvedFallback
        : placeholder;

  const onError = () => {
    if (stage === 'primary') {
      if (
        resolvedFallback &&
        resolvedFallback !== resolvedPrimary &&
        resolvedFallback !== placeholder
      ) {
        setStage('fallback');
        return;
      }
      setStage('placeholder');
      return;
    }
    if (stage === 'fallback') {
      setStage('placeholder');
    }
  };

  return (
    <View style={[styles.base, style]}>
      {src ? (
        <Image
          source={{ uri: src }}
          style={styles.fill}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          onError={onError}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    backgroundColor: '#E8EAED',
  },
  fill: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
});
