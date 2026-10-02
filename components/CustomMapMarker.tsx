import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Marker, type MapMarkerProps } from 'react-native-maps';

import { CyanPinFallback } from '@/components/MapPinFallback';
import { theme } from '@/constants/theme';

type CustomMapMarkerProps = Omit<MapMarkerProps, 'tracksViewChanges'> & {
  children: ReactNode;
  /**
   * 見た目が変わったら再スナップショットするキー
   * （選択状態・件数・スポーツなど）
   */
  trackKey?: string | number | boolean | null;
  /** 強制的に tracksViewChanges を維持したい場合 */
  forceTracking?: boolean;
};

/** Android は SVG/影の描画が遅いので、早すぎる false で透明ピンになる */
const SETTLE_MS = Platform.OS === 'android' ? 900 : 160;

/**
 * カスタム View マーカー用ラッパー。
 *
 * react-native-maps / Google Maps は子 View のビットマップが準備できるまで
 * 標準の赤いピンを出すことがある。tracksViewChanges をレイアウト完了まで
 * true にし、Android では collapsable={false} で描画落ちを防ぐ。
 * pinColor は万一デフォルトマーカーが出たとき用の水色フォールバック。
 */
export default function CustomMapMarker({
  children,
  trackKey,
  forceTracking = false,
  coordinate,
  identifier,
  ...rest
}: CustomMapMarkerProps) {
  const [tracking, setTracking] = useState(true);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    if (mountedRef.current) setTracking(true);
    return () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
  }, [trackKey, identifier, coordinate.latitude, coordinate.longitude]);

  const settleTracking = useCallback(() => {
    const generation = generationRef.current;
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
    }
    // SVG / アイコン描画を待ってからスナップショット固定
    settleTimerRef.current = setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!mountedRef.current) return;
          if (generation !== generationRef.current) return;
          setTracking(false);
        });
      });
    }, SETTLE_MS);
  }, []);

  return (
    <Marker
      {...rest}
      identifier={identifier}
      coordinate={coordinate}
      pinColor={theme.colors.primary}
      tracksViewChanges={forceTracking || tracking}
    >
      <View
        collapsable={false}
        style={styles.host}
        onLayout={settleTracking}
        pointerEvents="box-none"
      >
        <PinErrorBoundary>{children}</PinErrorBoundary>
      </View>
    </Marker>
  );
}

class PinErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (__DEV__) {
      console.warn('[map] custom pin render failed', error, info.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      return <CyanPinFallback />;
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  host: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
});
