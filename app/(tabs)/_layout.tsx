import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { ChatIcon } from '@/components/icons';
import { theme } from '@/constants/theme';
import { formatUnreadBadge } from '@/lib/chats';
import { useAuth } from '@/lib/authContext';
import { useChats } from '@/lib/chatsContext';
import { useHomeBrowse } from '@/lib/homeBrowseContext';

export default function TabLayout() {
  const { isReady, isLoggedIn } = useAuth();
  const { unreadCount } = useChats();
  const { resetToCurrentLocation } = useHomeBrowse();
  const messagesBadge = formatUnreadBadge(isLoggedIn ? unreadCount : 0);

  // 認証判定が終わるまで待つ（前回ルート復元でホームが先に出るのを防ぐ）
  if (!isReady) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={theme.colors.primaryDark} size="large" />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.iconInactive,
        headerShown: useClientOnlyValue(false, true),
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: {
          fontWeight: '700',
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'ホーム',
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                ios: 'house.fill',
                android: 'home',
                web: 'home',
              }}
              tintColor={color}
              size={26}
            />
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: () => {
            // すでにホームにいる状態での再タップ → 現在地へリセット
            if (navigation.isFocused()) {
              void resetToCurrentLocation();
            }
          },
        })}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'メッセージ',
          headerShown: false,
          tabBarBadge: messagesBadge,
          tabBarBadgeStyle: {
            backgroundColor: theme.colors.danger,
            color: '#FFFFFF',
            fontSize: 10,
            fontWeight: '800',
            minWidth: 16,
            height: 16,
            lineHeight: 16,
          },
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                ios: 'bubble.left.fill',
                android: 'chat',
                web: 'chat',
              }}
              tintColor={color}
              size={26}
              fallback={<ChatIcon size={22} color={String(color)} />}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="mypage"
        options={{
          title: 'マイページ',
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                ios: 'person.fill',
                android: 'person',
                web: 'person',
              }}
              tintColor={color}
              size={26}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceAlt,
  },
});
