import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import ChatRoomScreen from '@/components/ChatRoomScreen';
import { theme } from '@/constants/theme';
import { parseChatMode } from '@/lib/chats';
import { useEvents } from '@/lib/eventsContext';

export default function ChatRoomRoute() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    eventId: string;
    chatMode?: string;
    dm?: string | string[];
  }>();
  const { events } = useEvents();
  const eventId = Array.isArray(params.eventId)
    ? params.eventId[0]
    : params.eventId;
  const chatMode = parseChatMode(params.chatMode);
  const dmParam = Array.isArray(params.dm) ? params.dm[0] : params.dm;
  const dmUserId = typeof dmParam === 'string' && dmParam.trim()
    ? dmParam.trim()
    : null;
  const event = events.find((item) => item.id === eventId) ?? null;

  const back = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/messages');
  };

  if (!event) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingTitle}>{t('chat.notFoundTitle')}</Text>
        <Text style={styles.missingBody}>
          {t('chat.notFoundBody')}
        </Text>
        <Pressable style={styles.homeBtn} onPress={back}>
          <Text style={styles.homeBtnText}>{t('chat.back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ChatRoomScreen
      event={event}
      mode={chatMode}
      dmUserId={dmUserId}
      onBack={back}
    />
  );
}

const styles = StyleSheet.create({
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: theme.colors.background,
  },
  missingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  missingBody: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 22,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  homeBtn: {
    marginTop: 20,
    backgroundColor: theme.colors.primaryDark,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  homeBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
});
