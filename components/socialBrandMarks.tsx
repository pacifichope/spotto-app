import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

type MarkProps = {
  size?: number;
  color?: string;
};

/**
 * Fabric で topSvgLayout が飛んでも落ちにくいよう、
 * - Svg は固定 px サイズのみ（% や onLayout は使わない）
 * - レイアウトは外側 View が持つ
 * - pointerEvents は none（Pressable の子として干渉させない）
 */
function SvgMarkFrame({
  size,
  children,
}: {
  size: number;
  children: ReactNode;
}) {
  return (
    <View
      collapsable={false}
      pointerEvents="none"
      style={[styles.frame, { width: size, height: size }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </View>
  );
}

/** Google Identity の標準マルチカラー「G」ロゴ（公式パス） */
export function GoogleGMark({ size = 20 }: MarkProps) {
  const px = Math.max(1, Math.round(size));
  return (
    <SvgMarkFrame size={px}>
      <Svg width={px} height={px} viewBox="0 0 48 48">
        <Path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <Path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <Path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <Path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </Svg>
    </SvgMarkFrame>
  );
}

/**
 * LINE 公式ブランドアイコン（吹き出し＋ LINE ワードマーク）。
 * 緑ボタン上では白一色で表示（LINE Login ボタンガイドライン準拠）。
 */
export function LineSpeechMark({ size = 28, color = '#FFFFFF' }: MarkProps) {
  const px = Math.max(1, Math.round(size));
  return (
    <SvgMarkFrame size={px}>
      <Svg width={px} height={px} viewBox="0 0 24 24">
        <Path
          fill={color}
          d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"
        />
      </Svg>
    </SvgMarkFrame>
  );
}

/** Sign in with Apple 用の公式シルエット */
export function AppleLogoMark({ size = 18, color = '#FFFFFF' }: MarkProps) {
  const px = Math.max(1, Math.round(size));
  return (
    <SvgMarkFrame size={px}>
      <Svg width={px} height={px} viewBox="0 0 24 24">
        <Path
          fill={color}
          d="M16.365 12.23c-.03-3.02 2.47-4.47 2.58-4.54-1.41-2.06-3.6-2.34-4.38-2.37-1.86-.19-3.64 1.1-4.58 1.1-.96 0-2.4-1.08-3.96-1.05-2.03.03-3.91 1.19-4.95 3.02-2.13 3.7-.54 9.16 1.52 12.16 1.01 1.47 2.2 3.11 3.77 3.05 1.52-.06 2.09-.97 3.93-.97 1.83 0 2.35.97 3.96.94 1.64-.03 2.67-1.48 3.66-2.96 1.16-1.69 1.64-3.33 1.66-3.41-.04-.02-3.18-1.22-3.21-4.97zM13.88 3.71c.83-1.01 1.39-2.41 1.24-3.81-1.2.05-2.66.8-3.52 1.8-.77.89-1.45 2.33-1.27 3.7 1.34.1 2.71-.68 3.55-1.69z"
        />
      </Svg>
    </SvgMarkFrame>
  );
}

/** Instagram 公式グリフ（カメラ＋ドット）。単色でバッジ上に配置 */
export function InstagramGlyphMark({ size = 20, color = '#FFFFFF' }: MarkProps) {
  const px = Math.max(1, Math.round(size));
  return (
    <SvgMarkFrame size={px}>
      <Svg width={px} height={px} viewBox="0 0 24 24">
        <Path
          fill={color}
          d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"
        />
      </Svg>
    </SvgMarkFrame>
  );
}

/** X（旧 Twitter）公式ワードマーク */
export function XLogoMark({ size = 18, color = '#FFFFFF' }: MarkProps) {
  const px = Math.max(1, Math.round(size));
  return (
    <SvgMarkFrame size={px}>
      <Svg width={px} height={px} viewBox="0 0 24 24">
        <Path
          fill={color}
          d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
        />
      </Svg>
    </SvgMarkFrame>
  );
}

/** Web サイト用の地球アイコン */
export function WebsiteGlobeMark({ size = 20, color = '#FFFFFF' }: MarkProps) {
  const px = Math.max(1, Math.round(size));
  return (
    <SvgMarkFrame size={px}>
      <Svg width={px} height={px} viewBox="0 0 24 24">
        <Circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke={color}
          strokeWidth="1.75"
        />
        <Path
          fill="none"
          stroke={color}
          strokeWidth="1.75"
          d="M3 12h18M12 3c2.5 2.8 3.75 5.8 3.75 9S14.5 18.2 12 21c-2.5-2.8-3.75-5.8-3.75-9S9.5 5.8 12 3z"
        />
        <Path
          fill="none"
          stroke={color}
          strokeWidth="1.75"
          d="M5.2 7.5h13.6M5.2 16.5h13.6"
        />
      </Svg>
    </SvgMarkFrame>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
