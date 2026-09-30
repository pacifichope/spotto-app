import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardEvent,
} from 'react-native';
import { KeyboardAvoidingScreen } from '@/components/KeyboardForm';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';
import { useAuth } from '@/lib/authContext';
import {
  type ChatMessage,
  type EventChatMode,
} from '@/lib/chats';
import { useChats } from '@/lib/chatsContext';
import type { SportEvent } from '@/lib/events';
import { useEvents } from '@/lib/eventsContext';
import { isHostedByMe } from '@/lib/organizerProfile';

export type { EventChatMode };

type EventChatModalProps = {
  visible: boolean;
  mode: EventChatMode;
  event: SportEvent | null;
  onClose: () => void;
};

export default function EventChatModal({
  visible,
  mode,
  event,
  onClose,
}: EventChatModalProps) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [draft, setDraft] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const { getMessages, sendMessage, watchThread, refreshThread } = useChats();
  const { requireAuth } = useAuth();
  const { hostedIds, currentUserId } = useEvents();
  const ownEvent = event
    ? isHostedByMe(event, hostedIds, currentUserId)
    : false;
  const dmUserId =
    mode === 'host' ? (ownEvent ? null : currentUserId) : null;
  const messages = event ? getMessages(event.id, mode, dmUserId) : [];

  const scrollToLatest = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const scrollToLatestAfterKeyboard = useCallback(
    (event?: KeyboardEvent) => {
      scrollToLatest(true);
      const duration =
        Platform.OS === 'ios'
          ? Math.max(event?.duration ?? 250, 60)
          : 120;
      setTimeout(() => scrollToLatest(true), duration);
      setTimeout(() => scrollToLatest(true), duration + 80);
    },
    [scrollToLatest],
  );

  useEffect(() => {
    if (!visible || !event) return;
    if (mode === 'host' && !dmUserId) return;
    const unwatch = watchThread(event, mode, dmUserId);
    setDraft('');
    const pollId = setInterval(() => {
      void refreshThread(event, mode, dmUserId);
    }, 5_000);
    return () => {
      clearInterval(pollId);
      unwatch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [
    visible,
    event?.id,
    event?.hostId,
    mode,
    dmUserId,
    watchThread,
    refreshThread,
  ]);

  useEffect(() => {
    if (!visible) return;
    scrollToLatest(false);
  }, [visible, messages.length, scrollToLatest]);

  useEffect(() => {
    if (!visible) {
      setKeyboardOpen(false);
      return;
    }
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (event: KeyboardEvent) => {
      setKeyboardOpen(true);
      scrollToLatestAfterKeyboard(event);
    };
    const onHide = () => setKeyboardOpen(false);
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible, scrollToLatestAfterKeyboard]);

  const send = () => {
    const text = draft.trim();
    if (!text || !event) return;
    if (mode === 'host' && !dmUserId) {
      Alert.alert(
        '送信できません',
        'メッセージの相手が特定できません。',
      );
      return;
    }
    const deliver = () => {
      setDraft('');
      scrollToLatest(true);
      void (async () => {
        const result = await sendMessage(event.id, mode, text, {
          dmUserId,
          hostUserId: event.hostId,
        });
        if (!result.ok) {
          Alert.alert('送信に失敗しました', result.error);
          setDraft(text);
          return;
        }
        scrollToLatest(true);
        void refreshThread(event, mode, dmUserId);
      })();
    };
    if (!requireAuth(deliver, 'send-chat')) return;
    deliver();
  };

  return (
    <Modal
      visible={visible && !!event}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {event ? (
        <KeyboardAvoidingScreen
          style={styles.screen}
          keyboardVerticalOffset={
            Platform.OS === 'ios' ? Math.max(insets.top, 12) : 0
          }
        >
          <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="チャットを閉じる"
            >
              <Text style={styles.back}>‹ 戻る</Text>
            </Pressable>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {mode === 'host'
                  ? `${event.host}`
                  : `グループチャット`}
              </Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                {mode === 'host'
                  ? '主催者への個別メッセージ'
                  : `${event.title} · 参加者限定`}
              </Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={
              <View style={styles.notice}>
                <Text style={styles.noticeText}>
                  {mode === 'host'
                    ? '主催者との個別チャットです。他の参加者には表示されません。'
                    : 'このチャットは、申し込んだ参加者と主催者だけが閲覧・投稿できます。'}
                </Text>
              </View>
            }
            contentContainerStyle={styles.list}
            onContentSizeChange={() => scrollToLatest(false)}
            onLayout={() => scrollToLatest(false)}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            renderItem={({ item }) => {
              const mine = item.role === 'me';
              return (
                <View
                  style={[
                    styles.bubbleRow,
                    mine ? styles.bubbleRowMine : styles.bubbleRowOther,
                  ]}
                >
                  {!mine ? (
                    <Text style={styles.author}>
                      {mode === 'host' || item.role === 'host'
                        ? `${item.name}（主催）`
                        : item.name}
                    </Text>
                  ) : null}
                  <View
                    style={[
                      styles.bubble,
                      mine ? styles.bubbleMine : styles.bubbleOther,
                    ]}
                  >
                    <Text
                      style={[
                        styles.bubbleText,
                        mine && styles.bubbleTextMine,
                      ]}
                    >
                      {item.text}
                    </Text>
                  </View>
                  <Text style={[styles.time, mine && styles.timeMine]}>
                    {item.time}
                  </Text>
                </View>
              );
            }}
          />

          <View
            style={[
              styles.composer,
              {
                paddingBottom: keyboardOpen
                  ? 10
                  : Math.max(insets.bottom, 10),
              },
            ]}
          >
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="メッセージを入力"
              placeholderTextColor={theme.colors.textMuted}
              multiline
              returnKeyType="send"
              onSubmitEditing={send}
              blurOnSubmit={false}
              onFocus={() => scrollToLatestAfterKeyboard()}
            />
            <Pressable
              style={[styles.sendBtn, !draft.trim() && styles.sendBtnDisabled]}
              onPress={send}
              disabled={!draft.trim()}
              accessibilityRole="button"
              accessibilityLabel="送信"
            >
              <Text style={styles.sendText}>送信</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingScreen>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    gap: 8,
  },
  back: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.primaryDark,
    width: 64,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text,
  },
  headerSub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  headerSpacer: {
    width: 64,
  },
  list: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 12,
  },
  notice: {
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.primarySoft,
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: theme.colors.primaryDark,
  },
  bubbleRow: {
    maxWidth: '86%',
  },
  bubbleRowMine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  bubbleRowOther: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  author: {
    marginBottom: 4,
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bubbleMine: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.text,
  },
  bubbleTextMine: {
    color: '#fff',
    fontWeight: '600',
  },
  time: {
    marginTop: 3,
    fontSize: 10,
    color: theme.colors.textMuted,
  },
  timeMine: {
    textAlign: 'right',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: theme.colors.search,
    fontSize: 15,
    color: theme.colors.text,
  },
  sendBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: theme.colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
});
