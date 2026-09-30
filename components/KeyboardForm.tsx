import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type Ref,
} from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** キーボード直上に確保する余白（入力欄・ボタンが隠れないように） */
export const KEYBOARD_FORM_BOTTOM_GAP = 28;

/**
 * キーボードが「いまのウィンドウ」をどれだけ覆っているか（px）。
 * - iOS: endCoordinates.height
 * - Android: window 高さと keyboard.screenY の差
 *   adjustResize で既に縮んでいるときは ≈0（二重押し上げしない）
 *   Modal / 絶対配置で resize が効かないときはキーボード高になる
 */
export function keyboardOverlapFromEvent(e: KeyboardEvent): number {
  const { height, screenY } = e.endCoordinates;
  const keyboardH = Math.max(0, Math.round(height));
  if (Platform.OS === 'ios') {
    return keyboardH;
  }
  const windowH = Dimensions.get('window').height;
  if (!Number.isFinite(windowH) || !Number.isFinite(screenY)) {
    return keyboardH;
  }
  // resize 済み: window 下端 ≒ screenY → 0
  // 未リサイズ: window 下端がキーボードに隠れている分だけ正
  const overlap = Math.round(windowH - screenY);
  if (!Number.isFinite(overlap) || overlap <= 0) return 0;
  // 異常値はキーボード高までに抑える
  return Math.min(overlap, keyboardH || overlap);
}

export type UseKeyboardBottomInsetOptions = {
  /**
   * true: 常に endCoordinates.height を使う（絶対配置オーバーレイ向け）。
   * false/未指定: Android はウィンドウとの重なり量（resize 二重押し上げ防止）。
   */
  forceKeyboardHeight?: boolean;
};

/**
 * 絶対配置フッター／pageSheet Modal 向け。キーボード表示中の下部オフセット。
 * enabled=false または非表示時は 0。
 */
export function useKeyboardBottomInset(
  enabled = true,
  options?: UseKeyboardBottomInsetOptions,
): number {
  const [inset, setInset] = useState(0);
  const forceKeyboardHeight = Boolean(options?.forceKeyboardHeight);

  useEffect(() => {
    if (!enabled) {
      setInset(0);
      return;
    }
    const showEvt =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: KeyboardEvent) => {
      if (forceKeyboardHeight) {
        setInset(Math.max(0, Math.round(e.endCoordinates.height)));
        return;
      }
      setInset(keyboardOverlapFromEvent(e));
    };
    const onHide = () => setInset(0);
    const showSub = Keyboard.addListener(showEvt, onShow);
    const hideSub = Keyboard.addListener(hideEvt, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [enabled, forceKeyboardHeight]);

  return enabled ? inset : 0;
}

export type KeyboardFormScrollViewProps = Omit<
  ComponentProps<typeof ScrollView>,
  'ref'
> & {
  /** ScrollView 外側のスタイル */
  containerStyle?: StyleProp<ViewStyle>;
  /** セーフエリア以外に常時足す下部余白 */
  bottomGap?: number;
  /**
   * 親で KeyboardAvoidingView を使う場合は false にして二重補正を避ける。
   * 未指定時は iOS で automaticallyAdjustKeyboardInsets を有効化。
   */
  automaticallyAdjustKeyboardInsets?: boolean;
  /**
   * 互換用（親側の KeyboardAvoidingScreen オフセット）。
   * このコンポーネント単体では未使用。
   */
  keyboardVerticalOffset?: number;
  children?: ReactNode;
};

export type KeyboardFormScrollViewRef = {
  scrollToFocusedInput: (extraOffset?: number) => void;
  scrollToEnd: (animated?: boolean) => void;
  getNode: () => ScrollView | null;
};

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (value: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(value);
      else (ref as { current: T | null }).current = value;
    }
  };
}

/**
 * フォーム画面用の共通スクロール。
 * - フォーカス時に入力欄をキーボード直上へスクロール
 * - iOS: automaticallyAdjustKeyboardInsets
 * - Android: window resize（app.config）＋明示スクロール／軽い余白
 */
export const KeyboardFormScrollView = forwardRef<
  KeyboardFormScrollViewRef,
  KeyboardFormScrollViewProps
>(function KeyboardFormScrollView(
  {
    children,
    contentContainerStyle,
    containerStyle,
    style,
    bottomGap = KEYBOARD_FORM_BOTTOM_GAP,
    keyboardVerticalOffset: _keyboardVerticalOffset = 0,
    automaticallyAdjustKeyboardInsets = Platform.OS === 'ios',
    keyboardShouldPersistTaps = 'handled',
    keyboardDismissMode = Platform.OS === 'ios' ? 'interactive' : 'on-drag',
    onScroll,
    ...rest
  },
  ref,
) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const pendingFocusScroll = useRef<ReturnType<typeof setTimeout> | null>(null);
  void _keyboardVerticalOffset;

  const scrollToFocusedInput = useCallback((extraOffset = 0) => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const focused = TextInput.State.currentlyFocusedInput?.();
    if (!focused) return;
    const offset = bottomGap + 16 + extraOffset;
    try {
      scroll.scrollResponderScrollNativeHandleToKeyboard(
        focused,
        offset,
        true,
      );
    } catch {
      const node = focused as {
        measureInWindow?: (
          cb: (x: number, y: number, w: number, h: number) => void,
        ) => void;
      };
      node.measureInWindow?.((_x, y, _w, _h) => {
        const targetY = Math.max(0, scrollYRef.current + y - 80);
        scroll.scrollTo({ y: targetY, animated: true });
      });
    }
  }, [bottomGap]);

  const scheduleScrollToFocused = useCallback(() => {
    if (pendingFocusScroll.current) clearTimeout(pendingFocusScroll.current);
    // キーボード表示アニメとフォーカスのタイミングを合わせる
    pendingFocusScroll.current = setTimeout(() => {
      scrollToFocusedInput();
      // キーボードが遅れて開く端末向けに再試行
      pendingFocusScroll.current = setTimeout(() => {
        scrollToFocusedInput();
      }, Platform.OS === 'ios' ? 120 : 80);
    }, Platform.OS === 'ios' ? 40 : 16);
  }, [scrollToFocusedInput]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToFocusedInput,
      scrollToEnd: (animated = true) => {
        scrollRef.current?.scrollToEnd({ animated });
      },
      getNode: () => scrollRef.current,
    }),
    [scrollToFocusedInput],
  );

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const onShow = (_e: KeyboardEvent) => {
      scheduleScrollToFocused();
    };
    const sub = Keyboard.addListener(showEvent, onShow);
    return () => {
      sub.remove();
      if (pendingFocusScroll.current) clearTimeout(pendingFocusScroll.current);
    };
  }, [scheduleScrollToFocused]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollYRef.current = event.nativeEvent.contentOffset.y;
      onScroll?.(event);
    },
    [onScroll],
  );

  const baseBottom =
    Math.max(insets.bottom, 16) + bottomGap;

  const scroll = (
    <ScrollView
      ref={scrollRef}
      style={[styles.flex, style]}
      contentContainerStyle={[
        { flexGrow: 1, paddingBottom: baseBottom },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      // 親で KeyboardAvoidingView を使う場合は呼び出し側で false にする
      automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      {...rest}
      // ScrollView 型に無いが、子 TextInput のフォーカス捕捉に有効
      {...({ onFocusCapture: scheduleScrollToFocused } as object)}
    >
      {children}
    </ScrollView>
  );

  // 外側は常に View。iOS の inset 補正と Android の window resize に任せ、
  // フォーカス時スクロールで入力欄をキーボード上へ運ぶ。
  return <View style={[styles.flex, containerStyle]}>{scroll}</View>;
});

export type KeyboardAvoidingScreenProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** チャット等: ヘッダー高さやセーフエリア分 */
  keyboardVerticalOffset?: number;
  /** false で無効化（Web 等） */
  enabled?: boolean;
};

/**
 * 画面全体をキーボードから退避させるラッパー（チャットの固定入力バー等）。
 * スクロールフォームには KeyboardFormScrollView を使う。
 */
export function KeyboardAvoidingScreen({
  children,
  style,
  keyboardVerticalOffset = 0,
  enabled = Platform.OS !== 'web',
}: KeyboardAvoidingScreenProps) {
  if (!enabled) {
    return <View style={[styles.flex, style]}>{children}</View>;
  }
  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
