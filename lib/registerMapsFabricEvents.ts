/**
 * react-native-maps が New Architecture (Fabric) 上で
 * `topUserLocationChange` を Paper 互換パス経由で飛ばすと、
 * customDirectEventTypes 未登録のため ReactFabric がクラッシュする。
 *
 * 起動直後にイベント型を登録する（postinstall の ReactFabric パッチと併用）。
 */
import { Platform } from 'react-native';

type DirectEventConfig = { registrationName: string };

function registerDirectEvent(topLevelType: string, registrationName: string) {
  try {
    // Metro は Flow 付き RN shim を変換できる。静的パスで解決する。
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const registry =
      require('react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry') as {
        customDirectEventTypes?: Record<string, DirectEventConfig | undefined>;
        default?: {
          customDirectEventTypes?: Record<string, DirectEventConfig | undefined>;
        };
      };
    const types =
      registry.customDirectEventTypes ??
      registry.default?.customDirectEventTypes;
    if (!types) return;
    types[topLevelType] = { registrationName };
  } catch {
    // ReactFabric パッチ側で握りつぶす
  }
}

export function registerMapsFabricEvents() {
  if (Platform.OS === 'web') return;
  registerDirectEvent('topUserLocationChange', 'onUserLocationChange');
  registerDirectEvent('topuserlocationchange', 'onUserLocationChange');
}

registerMapsFabricEvents();
