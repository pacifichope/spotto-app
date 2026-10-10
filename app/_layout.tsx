import '@/lib/polyfills/webcrypto';
// RNFB deprecation 抑制は Auth モジュール読み込みより前に実行する
import '@/lib/firebaseNativeInit';
import '@/lib/registerMapsFabricEvents';
import '@/lib/silenceProdConsole';
import 'react-native-gesture-handler';

import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import 'react-native-reanimated';

import AppProviders from '@/components/AppProviders';
import ConnectionBanner from '@/components/ConnectionBanner';
import { theme } from '@/constants/theme';
import { ensureLineSdkReady } from '@/lib/firebaseLineAuth';
import { useNotificationDeepLinks } from '@/lib/notificationDeepLink';
import { useSettledWindow } from '@/lib/useSettledWindow';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

SplashScreen.preventAutoHideAsync();
WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const windowSize = useSettledWindow();

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  // モジュール評価時ではなくマウント後に初期化（Web SSR の window 未定義を避ける）
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window === 'undefined') return;
    void ensureLineSdkReady();
  }, []);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  return (
    <GestureHandlerRootView
      collapsable={false}
      style={[
        styles.root,
        { width: windowSize.width, height: windowSize.height },
      ]}
    >
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          <AppProviders>
            {loaded ? <RootLayoutNav /> : null}
          </AppProviders>
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  useNotificationDeepLinks();

  return (
    <ThemeProvider value={DefaultTheme}>
      <StatusBar style="dark" />
      <ConnectionBanner />
      <Stack
        screenOptions={{
          freezeOnBlur: false,
          contentStyle: { flex: 1 },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="chat/[eventId]/[chatMode]"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="event/[id]"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="ticket/[eventId]"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="clubs"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="club/[id]"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="auth/callback"
          options={{
            headerShown: false,
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="auth/phone"
          options={{
            headerShown: false,
            animation: 'slide_from_bottom',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="payment-complete"
          options={{
            headerShown: false,
            animation: 'fade',
          }}
        />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
