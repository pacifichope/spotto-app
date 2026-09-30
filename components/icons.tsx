import {
  Feather,
  Ionicons,
  MaterialCommunityIcons,
} from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { theme, categoryColor } from '@/constants/theme';

type FeatherName = ComponentProps<typeof Feather>['name'];
type IoniconsName = ComponentProps<typeof Ionicons>['name'];
type MCIName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type AppIconProps = {
  size?: number;
  color?: string;
};

type SportIconSpec =
  | { set: 'mci'; name: MCIName }
  | { set: 'feather'; name: FeatherName }
  | { set: 'ion'; name: IoniconsName };

const SPORT_ICON_MAP: Record<string, SportIconSpec> = {
  サッカー: { set: 'mci', name: 'soccer' },
  バスケットボール: { set: 'mci', name: 'basketball' },
  バスケ: { set: 'mci', name: 'basketball' },
  テニス: { set: 'mci', name: 'tennis' },
  ランニング: { set: 'mci', name: 'run' },
  フットサル: { set: 'mci', name: 'soccer' },
  バドミントン: { set: 'mci', name: 'badminton' },
  バレーボール: { set: 'mci', name: 'volleyball' },
  バレー: { set: 'mci', name: 'volleyball' },
  野球: { set: 'mci', name: 'baseball' },
  ヨガ: { set: 'mci', name: 'yoga' },
  その他: { set: 'feather', name: 'tag' },
};

const CATEGORY_ICON_MAP: Record<string, SportIconSpec> = {
  all: { set: 'ion', name: 'sparkles-outline' },
  hot: { set: 'ion', name: 'flame-outline' },
  ...SPORT_ICON_MAP,
};

function renderSpec(spec: SportIconSpec, size: number, color: string) {
  if (spec.set === 'mci') {
    return <MaterialCommunityIcons name={spec.name} size={size} color={color} />;
  }
  if (spec.set === 'ion') {
    return <Ionicons name={spec.name} size={size} color={color} />;
  }
  return <Feather name={spec.name} size={size} color={color} />;
}

/** カテゴリチップ用（すべて / 人気 / 各スポーツ） */
export function CategoryIcon({
  id,
  size = 15,
  color,
}: AppIconProps & { id: string }) {
  const spec =
    CATEGORY_ICON_MAP[id] ??
    SPORT_ICON_MAP[id] ??
    ({ set: 'feather', name: 'tag' } as const);
  return renderSpec(spec, size, color ?? categoryColor(id));
}

/** スポーツ名から線アイコン（色未指定時はカテゴリ色） */
export function SportIcon({
  sport,
  size = 18,
  color,
}: AppIconProps & { sport: string }) {
  const key = sport.trim();
  const spec =
    SPORT_ICON_MAP[key] ?? ({ set: 'feather', name: 'activity' } as const);
  return renderSpec(spec, size, color ?? categoryColor(key));
}

/** 空状態用の角丸コンテナ付きアイコン */
export function EmptyStateIcon({
  children,
  size = 72,
  radius = theme.radius.lg,
  style,
}: {
  children: ReactNode;
  size?: number;
  radius?: number;
  style?: object;
}) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: theme.colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          marginBottom: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SearchIcon(props: AppIconProps) {
  return (
    <Feather
      name="search"
      size={props.size ?? 16}
      color={props.color ?? theme.colors.iconInactive}
    />
  );
}

export function MapPinIcon(props: AppIconProps) {
  return (
    <Feather
      name="map-pin"
      size={props.size ?? 16}
      color={props.color ?? theme.colors.iconInactive}
    />
  );
}

export function ListIcon(props: AppIconProps) {
  return (
    <Feather
      name="list"
      size={props.size ?? 16}
      color={props.color ?? theme.colors.iconInactive}
    />
  );
}

export function CalendarIcon(props: AppIconProps) {
  return (
    <Feather
      name="calendar"
      size={props.size ?? 16}
      color={props.color ?? theme.colors.iconInactive}
    />
  );
}

export function ClockIcon(props: AppIconProps) {
  return (
    <Feather
      name="clock"
      size={props.size ?? 16}
      color={props.color ?? theme.colors.iconInactive}
    />
  );
}

export function HourglassIcon(props: AppIconProps) {
  return (
    <MaterialCommunityIcons
      name="timer-sand"
      size={props.size ?? 16}
      color={props.color ?? theme.colors.iconInactive}
    />
  );
}

export function CancelPolicyIcon(props: AppIconProps) {
  return (
    <Feather
      name="rotate-ccw"
      size={props.size ?? 16}
      color={props.color ?? theme.colors.iconInactive}
    />
  );
}

export function TargetIcon(props: AppIconProps) {
  return (
    <Feather
      name="target"
      size={props.size ?? 16}
      color={props.color ?? theme.colors.iconInactive}
    />
  );
}

export function ChatIcon(props: AppIconProps) {
  return (
    <Feather
      name="message-circle"
      size={props.size ?? 16}
      color={props.color ?? theme.colors.iconInactive}
    />
  );
}

export function BlockEmptyIcon(props: AppIconProps) {
  return (
    <Feather
      name="user-x"
      size={props.size ?? 28}
      color={props.color ?? theme.colors.iconEmpty}
    />
  );
}

export function CalendarEmptyIcon(props: AppIconProps) {
  return (
    <Feather
      name="calendar"
      size={props.size ?? 28}
      color={props.color ?? theme.colors.iconEmpty}
    />
  );
}

export function PackageEmptyIcon(props: AppIconProps) {
  return (
    <Feather
      name="package"
      size={props.size ?? 28}
      color={props.color ?? theme.colors.iconEmpty}
    />
  );
}

export function HeartEmptyIcon(props: AppIconProps) {
  return (
    <Feather
      name="heart"
      size={props.size ?? 28}
      color={props.color ?? theme.colors.iconEmpty}
    />
  );
}

export function SparklesEmptyIcon(props: AppIconProps) {
  return (
    <Ionicons
      name="sparkles-outline"
      size={props.size ?? 28}
      color={props.color ?? theme.colors.iconEmpty}
    />
  );
}

export function EditEmptyIcon(props: AppIconProps) {
  return (
    <Feather
      name="edit-3"
      size={props.size ?? 28}
      color={props.color ?? theme.colors.iconEmpty}
    />
  );
}

export function UsersEmptyIcon(props: AppIconProps) {
  return (
    <Feather
      name="users"
      size={props.size ?? 28}
      color={props.color ?? theme.colors.iconEmpty}
    />
  );
}

export function CheckIcon(props: AppIconProps) {
  return (
    <Feather
      name="check"
      size={props.size ?? 16}
      color={props.color ?? theme.colors.primaryDark}
    />
  );
}

/** 設定リストなど：アプリ内画面への遷移 */
export function ChevronRightIcon(props: AppIconProps) {
  return (
    <Feather
      name="chevron-right"
      size={props.size ?? 20}
      color={props.color ?? theme.colors.textMuted}
    />
  );
}

/** 設定リストなど：外部ブラウザ／Web への遷移 */
export function ExternalLinkIcon(props: AppIconProps) {
  return (
    <Feather
      name="external-link"
      size={props.size ?? 18}
      color={props.color ?? theme.colors.textMuted}
    />
  );
}
