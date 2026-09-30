import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  Stop,
} from 'react-native-svg';

import { SportIcon } from '@/components/icons';
import { categoryColor, theme } from '@/constants/theme';

const PIN_W = 48;
const PIN_H = 58;

type EventMapPinProps = {
  sport: string;
  selected?: boolean;
  joined?: boolean;
  /** SVG グラデーション id の衝突回避用 */
  gradientId?: string;
  /** コンパクト表示（詳細ミニマップ向け） */
  compact?: boolean;
};

/**
 * ブランドカラーのカスタム地図ピン。
 * 丸頭＋下向きティップの中にスポーツアイコンを配置。
 * 標準の赤いデフォルトマーカーは使わない。
 */
export default function EventMapPin({
  sport,
  selected = false,
  joined = false,
  gradientId = 'eventMapPin',
  compact = false,
}: EventMapPinProps) {
  const highlighted = selected || joined;
  const fillId = `${gradientId}-fill`;
  const scale = compact ? 0.86 : 1;
  const width = Math.round(PIN_W * scale);
  const height = Math.round(PIN_H * scale);
  const accent = categoryColor(sport);
  const start = highlighted ? theme.colors.primary : theme.colors.accent;
  const end = highlighted ? theme.colors.accent : theme.colors.primary;
  const iconSize = compact ? 15 : 18;
  const solidFill = highlighted ? theme.colors.primary : theme.colors.primaryDark;

  return (
    <View
      collapsable={false}
      style={[
        styles.wrap,
        { width, height },
        selected && styles.wrapSelected,
      ]}
      pointerEvents="none"
    >
      <View
        collapsable={false}
        style={[styles.shadowHost, { width, height }]}
        pointerEvents="none"
      >
        <Svg width={width} height={height} viewBox={`0 0 ${PIN_W} ${PIN_H}`}>
          <Defs>
            <LinearGradient id={fillId} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={start} />
              <Stop offset="55%" stopColor={theme.colors.primary} />
              <Stop offset="100%" stopColor={end} />
            </LinearGradient>
          </Defs>

          <Ellipse
            cx={24}
            cy={54.5}
            rx={11}
            ry={2.6}
            fill="rgba(15, 23, 42, 0.28)"
          />

          {/* solid を下に敷き、グラデーション非対応でも水色ピンを保証 */}
          <Path
            d="M24 2.5C13.2 2.5 4.5 11.2 4.5 22c0 12.8 15.4 30.6 18.4 33.9a1.4 1.4 0 0 0 2.2 0C28.1 52.6 43.5 34.8 43.5 22 43.5 11.2 34.8 2.5 24 2.5z"
            fill={solidFill}
            stroke="#FFFFFF"
            strokeWidth={highlighted ? 2.6 : 2.2}
          />
          <Path
            d="M24 2.5C13.2 2.5 4.5 11.2 4.5 22c0 12.8 15.4 30.6 18.4 33.9a1.4 1.4 0 0 0 2.2 0C28.1 52.6 43.5 34.8 43.5 22 43.5 11.2 34.8 2.5 24 2.5z"
            fill={`url(#${fillId})`}
            stroke="#FFFFFF"
            strokeWidth={highlighted ? 2.6 : 2.2}
          />

          <Circle cx={24} cy={21.5} r={13.2} fill="#FFFFFF" />
          <Circle
            cx={24}
            cy={21.5}
            r={12.2}
            fill={highlighted ? 'rgba(41,209,232,0.12)' : '#FFFFFF'}
            stroke={accent}
            strokeWidth={1.2}
            strokeOpacity={0.35}
          />
        </Svg>

        <View
          collapsable={false}
          style={[styles.iconSlot, compact && styles.iconSlotCompact]}
          pointerEvents="none"
        >
          <SportIconSafe
            sport={sport}
            size={iconSize}
            color={highlighted ? theme.colors.primaryDark : accent}
          />
        </View>
      </View>
    </View>
  );
}

function SportIconSafe({
  sport,
  size,
  color,
}: {
  sport: string;
  size: number;
  color: string;
}) {
  try {
    return <SportIcon sport={sport || 'その他'} size={size} color={color} />;
  } catch {
    return (
      <View
        style={{
          width: size * 0.55,
          height: size * 0.55,
          borderRadius: size,
          backgroundColor: color,
        }}
      />
    );
  }
}

/** 場所選択などスポーツ非依存のブランドピン */
export function BrandLocationPin({
  selected = false,
  gradientId = 'brandLocPin',
}: {
  selected?: boolean;
  gradientId?: string;
}) {
  const fillId = `${gradientId}-fill`;
  return (
    <View
      collapsable={false}
      style={[styles.wrap, { width: PIN_W, height: PIN_H }]}
      pointerEvents="none"
    >
      <View
        collapsable={false}
        style={[styles.shadowHost, { width: PIN_W, height: PIN_H }]}
      >
        <Svg width={PIN_W} height={PIN_H} viewBox={`0 0 ${PIN_W} ${PIN_H}`}>
          <Defs>
            <LinearGradient id={fillId} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={theme.colors.accent} />
              <Stop offset="100%" stopColor={theme.colors.primary} />
            </LinearGradient>
          </Defs>
          <Ellipse
            cx={24}
            cy={54.5}
            rx={11}
            ry={2.6}
            fill="rgba(15, 23, 42, 0.28)"
          />
          <Path
            d="M24 2.5C13.2 2.5 4.5 11.2 4.5 22c0 12.8 15.4 30.6 18.4 33.9a1.4 1.4 0 0 0 2.2 0C28.1 52.6 43.5 34.8 43.5 22 43.5 11.2 34.8 2.5 24 2.5z"
            fill={theme.colors.primary}
            stroke="#FFFFFF"
            strokeWidth={selected ? 2.6 : 2.2}
          />
          <Path
            d="M24 2.5C13.2 2.5 4.5 11.2 4.5 22c0 12.8 15.4 30.6 18.4 33.9a1.4 1.4 0 0 0 2.2 0C28.1 52.6 43.5 34.8 43.5 22 43.5 11.2 34.8 2.5 24 2.5z"
            fill={`url(#${fillId})`}
            stroke="#FFFFFF"
            strokeWidth={selected ? 2.6 : 2.2}
          />
          <Circle cx={24} cy={21.5} r={13.2} fill="#FFFFFF" />
          <Circle cx={24} cy={21.5} r={5.5} fill={theme.colors.primary} />
          <Circle cx={24} cy={21.5} r={2.4} fill="#FFFFFF" />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  wrapSelected: {
    transform: [{ scale: 1.08 }],
  },
  shadowHost: {
    shadowColor: '#0B1A22',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.32,
    shadowRadius: 7,
    elevation: 9,
  },
  iconSlot: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlotCompact: {
    top: 9,
    height: 24,
  },
});
