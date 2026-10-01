import { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';

async function probeOnline(): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine !== false;
    }
    return true;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      await fetch('https://clients3.google.com/generate_204', {
        method: 'HEAD',
        signal: controller.signal,
      });
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

/**
 * オフライン時だけ表示。復帰したら自動で消える。
 */
export default function ConnectionBanner() {
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const refresh = async () => {
      const online = await probeOnline();
      if (!cancelled) setOffline(!online);
    };

    void refresh();
    timer = setInterval(() => {
      void refresh();
    }, 12_000);

    const onAppState = (state: string) => {
      if (state === 'active') void refresh();
    };
    const sub = AppState.addEventListener('change', onAppState);

    let removeWeb: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onOnline = () => setOffline(false);
      const onOffline = () => setOffline(true);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      removeWeb = () => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      };
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      sub.remove();
      removeWeb?.();
    };
  }, []);

  if (!offline) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { top: Math.max(insets.top, 8) + 48 }]}
    >
      <View style={styles.pill}>
        <Text style={styles.text}>接続がありません</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
    zIndex: 50,
  },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: theme.radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text,
  },
});
