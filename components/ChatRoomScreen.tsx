import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardEvent,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SymbolView } from 'expo-symbols';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAvoidingScreen } from '@/components/KeyboardForm';
import HostAvatar from '@/components/HostAvatar';
import AttendeeProfileOverlay from '@/components/AttendeeProfileOverlay';
import { SportIcon } from '@/components/icons';
import { theme } from '@/constants/theme';
import { useAuth } from '@/lib/authContext';
import type { EventAttendee } from '@/lib/attendees';
import {
  confirmBlockUser,
  confirmUnblockUser,
  eventHostUserId,
  visibleChatMessages,
} from '@/lib/blocks';
import { useBlocks } from '@/lib/blocksContext';
import { eventDetailHref } from '@/lib/chatNavigation';
import type { ChatMessage, EventChatMode } from '@/lib/chats';
import { formatChatBubbleTime, isSeededMessage } from '@/lib/chats';
import { useChats } from '@/lib/chatsContext';
import { eventPreviewUris, type SportEvent } from '@/lib/events';
import { localizedEventTitle } from '@/lib/eventLocalizedText';
import { useEvents } from '@/lib/eventsContext';
import { clubIdFromEvent } from '@/lib/clubs';
import { clubHref } from '@/lib/clubNavigation';
import { useAttendeeJoinedClubs } from '@/lib/useAttendeeJoinedClubs';
import { isHostedByMe } from '@/lib/organizerProfile';
import { fetchPublicProfileByUserId } from '@/lib/userProfileRemote';
import { useUserProfile } from '@/lib/userProfileContext';

const EMOJIS = ['😀', '😂', '🥰', '👍', '🔥', '🎉', '🏃', '💪', '🙏', '✨'];
const HEADER_AVATAR_SIZE = 36;
const DELETE_ACTION_WIDTH = 76;
/** iOS: 画面上端からの KeyboardAvoidingScreen 用のわずかな補正 */
const KEYBOARD_VERTICAL_OFFSET_IOS = 8;

type ChatRoomScreenProps = {
  event: SportEvent;
  mode: EventChatMode;
  /** host DM の相手ユーザー ID（主催者側で必須。参加者側は省略可） */
  dmUserId?: string | null;
  onBack: () => void;
  /** すでにイベント詳細上のモーダルなら、詳細へ戻す処理を渡す */
  onOpenEvent?: () => void;
};

export default function ChatRoomScreen({
  event,
  mode,
  dmUserId: dmUserIdProp = null,
  onBack,
  onOpenEvent,
}: ChatRoomScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [draft, setDraft] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [profileTarget, setProfileTarget] = useState<EventAttendee | null>(
    null,
  );
  const [profileLoading, setProfileLoading] = useState(false);
  const {
    getMessages,
    sendMessage,
    deleteMessage,
    markThreadRead,
    watchThread,
    refreshThread,
  } = useChats();
  const { requireAuth } = useAuth();
  const { blockUser, unblockUser, isBlocked, hiddenIds } = useBlocks();
  const { hostedIds, currentUserId, events, organizerProfile } = useEvents();
  const { clubs: profileClubs, loading: profileClubsLoading } =
    useAttendeeJoinedClubs({
      userId: profileTarget?.id,
      seedClubIds: profileTarget?.clubIds,
      hintClubIds: [clubIdFromEvent(event)],
      hintEvents: [event],
      events,
      organizerProfile,
      currentUserId,
      enabled: profileTarget != null,
    });
  const { userProfile, displayName } = useUserProfile();
  const hostId = eventHostUserId(event);
  const hostBlocked = isBlocked(hostId);
  const ownEvent = isHostedByMe(event, hostedIds, currentUserId);
  // host DM: 主催者は props / 参加者は自分の UID。表示・送信・購読で同じキーを使う
  const dmUserId =
    mode === 'host'
      ? dmUserIdProp?.trim() ||
        (!ownEvent ? currentUserId?.trim() || null : null)
      : null;
  const messages = visibleChatMessages(
    getMessages(event.id, mode, dmUserId),
    hiddenIds,
    hostId,
  );
  const title = localizedEventTitle(event);
  const subtitle = mode === 'host' ? event.host : t('chat.groupChat');
  const coverUri = eventPreviewUris(event, 1)[0];
  const messagingLocked = mode === 'host' && hostBlocked && !ownEvent;
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openEventDetail = () => {
    if (onOpenEvent) {
      onOpenEvent();
      return;
    }
    router.push(eventDetailHref(event.id));
  };

  // Modal 埋め込みでは useFocusEffect が発火しないため、マウント中は常に購読する
  useEffect(() => {
    // host DM で相手未確定のときは購読しない（誤スレッド作成を防ぐ）
    if (mode === 'host' && !dmUserId) return;
    const unwatch = watchThread(event, mode, dmUserId);
    markThreadRead(event.id, mode, dmUserId);
    // Realtime 取りこぼし用の短いポーリング（主経路は Realtime）
    const pollId = setInterval(() => {
      void refreshThread(event, mode, dmUserId);
    }, 5_000);
    return () => {
      clearInterval(pollId);
      unwatch();
    };
    // event オブジェクト参照ではなく id / hostId で購読を安定させる
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [
    event.id,
    event.hostId,
    mode,
    dmUserId,
    watchThread,
    refreshThread,
    markThreadRead,
  ]);

  // ルート画面ではフォーカス復帰時にも既読・再同期（Modal では no-op になり得る）
  useFocusEffect(
    useCallback(() => {
      if (mode === 'host' && !dmUserId) return;
      markThreadRead(event.id, mode, dmUserId);
      void refreshThread(event, mode, dmUserId);
    }, [
      event.id,
      mode,
      dmUserId,
      markThreadRead,
      refreshThread,
    ]),
  );

  useEffect(() => {
    markThreadRead(event.id, mode, dmUserId);
  }, [event.id, mode, dmUserId, markThreadRead, messages.length]);

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
    scrollToLatest(false);
  }, [messages.length, messages[messages.length - 1]?.id, scrollToLatest]);

  useEffect(() => {
    if (emojiOpen) scrollToLatest(true);
  }, [emojiOpen, scrollToLatest]);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (event: KeyboardEvent) => {
      setKeyboardOpen(true);
      scrollToLatestAfterKeyboard(event);
    };
    const onHide = () => {
      setKeyboardOpen(false);
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollToLatestAfterKeyboard]);

  const send = (text = draft) => {
    const next = text.trim();
    if (!next || messagingLocked || sending) return;
    if (mode === 'host' && !dmUserId) {
      Alert.alert(t('chat.cannotSendTitle'), t('chat.cannotSendBody'));
      return;
    }
    const deliver = () => {
      // 送信タップ直後に入力を消し、最下部へ（楽観更新は sendMessage 内）
      setDraft('');
      setEmojiOpen(false);
      scrollToLatest(true);
      void (async () => {
        setSending(true);
        try {
          const result = await sendMessage(event.id, mode, next, {
            dmUserId,
            hostUserId: event.hostId,
          });
          if (!result.ok) {
            Alert.alert(t('chat.sendFailedTitle'), result.error);
            setDraft(next);
            return;
          }
          scrollToLatest(true);
          // Realtime 取りこぼしに備え、成功直後にもう一度同期
          void refreshThread(event, mode, dmUserId);
        } catch (error) {
          console.error('[chat] send threw', error);
          setDraft(next);
          Alert.alert(t('chat.sendFailedTitle'), t('chat.checkConnection'));
        } finally {
          setSending(false);
        }
      })();
    };
    if (!requireAuth(deliver, 'send-chat')) return;
    deliver();
  };

  const resolveSenderId = (item: ChatMessage): string | null => {
    if (item.role === 'me') {
      return currentUserId?.trim() || null;
    }
    const fromMsg = item.senderId?.trim();
    if (fromMsg && fromMsg !== 'me') return fromMsg;
    if (item.role === 'host') {
      const hid = hostId?.trim();
      return hid && hid !== 'me' ? hid : null;
    }
    return null;
  };

  const openSenderProfile = (item: ChatMessage) => {
    const senderId = resolveSenderId(item);
    const fallbackName =
      item.role === 'me'
        ? displayName || item.name || userProfile.name || t('chat.me')
        : item.name.trim() || t('chat.user');
    const fallbackImage =
      item.role === 'me'
        ? userProfile.imageUri || item.imageUri
        : item.imageUri;

    if (!senderId) {
      // 自分で UID 未確定のときだけローカル表示
      if (item.role === 'me') {
        setProfileTarget({
          id: 'me',
          name: fallbackName,
          imageUri: fallbackImage,
          gender:
            userProfile.gender === '男性' || userProfile.gender === '女性'
              ? userProfile.gender
              : undefined,
          self: true,
        });
        return;
      }
      Alert.alert(
        t('chat.profileOpenFailedTitle'),
        t('chat.profileOpenFailedBody'),
      );
      return;
    }

    const optimistic: EventAttendee = {
      id: senderId,
      name: fallbackName,
      imageUri: fallbackImage,
      self: Boolean(currentUserId && senderId === currentUserId),
      gender:
        item.role === 'me' &&
        (userProfile.gender === '男性' || userProfile.gender === '女性')
          ? userProfile.gender
          : undefined,
    };
    setProfileTarget(optimistic);
    setProfileLoading(true);

    void (async () => {
      try {
        const result = await fetchPublicProfileByUserId(senderId);
        if (!result.ok) {
          Alert.alert(t('chat.profileFetchFailedTitle'), result.error);
          return;
        }
        const remote = result.data;
        setProfileTarget((prev) => {
          if (!prev || prev.id !== senderId) return prev;
          return {
            ...prev,
            name: remote.name.trim() || prev.name,
            imageUri: remote.imageUri || prev.imageUri,
            gender: remote.gender ?? prev.gender,
            self: Boolean(currentUserId && senderId === currentUserId),
          };
        });
      } catch (error) {
        console.warn('[chat] openSenderProfile failed', error);
        Alert.alert(
          t('chat.profileFetchFailedTitle'),
          t('chat.tryAgainLater'),
        );
      } finally {
        setProfileLoading(false);
      }
    })();
  };

  const canDeleteMessage = (item: ChatMessage) =>
    item.role === 'me' &&
    !isSeededMessage(item) &&
    (!item.senderId ||
      item.senderId === 'me' ||
      !currentUserId ||
      item.senderId === currentUserId);

  const confirmDeleteMessage = (item: ChatMessage) => {
    if (!canDeleteMessage(item) || deletingId) return;
    Alert.alert(t('chat.deleteTitle'), t('chat.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('chat.delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setDeletingId(item.id);
            try {
              const result = await deleteMessage(event.id, mode, item.id, {
                dmUserId,
              });
              if (!result.ok) {
                Alert.alert(t('chat.deleteFailedTitle'), result.error);
              }
            } catch (error) {
              console.error('[chat] delete threw', error);
              Alert.alert(
                t('chat.deleteFailedTitle'),
                t('chat.checkConnection'),
              );
            } finally {
              setDeletingId(null);
            }
          })();
        },
      },
    ]);
  };

  const openMenu = () => {
    if (mode === 'host' && !ownEvent) {
      openSenderProfile({
        id: 'menu-host',
        role: 'host',
        name: event.host,
        imageUri: event.hostImageUri,
        senderId: hostId,
        text: '',
        time: '',
        at: Date.now(),
      });
      return;
    }
    Alert.alert(
      title,
      mode === 'host'
        ? t('chat.menuHostInfo')
        : t('chat.menuGroupInfo'),
    );
  };

  const keyboardVerticalOffset =
    Platform.OS === 'ios' ? KEYBOARD_VERTICAL_OFFSET_IOS : 0;

  return (
    <View style={styles.screen}>
    <KeyboardAvoidingScreen
      style={styles.flex}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel={t('chat.back')}
        >
          <SymbolView
            name={{
              ios: 'chevron.left',
              android: 'chevron_left',
              web: 'chevron_left',
            }}
            tintColor={theme.colors.text}
            size={26}
            fallback={<Text style={styles.headerFallback}>‹</Text>}
          />
        </Pressable>
        <Pressable
          onPress={openEventDetail}
          style={({ pressed }) => [
            styles.headerTitleHit,
            pressed && styles.headerTitleHitPressed,
          ]}
          accessibilityRole="link"
          accessibilityLabel={t('chat.openEventLabel', { title })}
        >
          <View
            style={[
              styles.headerAvatar,
              {
                backgroundColor: event.accent || theme.colors.primarySoft,
              },
            ]}
          >
            {coverUri ? (
              <Image
                source={{ uri: coverUri }}
                style={styles.headerAvatarImage}
                resizeMode="cover"
              />
            ) : (
              <SportIcon
                sport={event.sport}
                size={20}
                color={theme.colors.iconActive}
              />
            )}
          </View>
          <View style={styles.headerTitleCol}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
          <SymbolView
            name={{
              ios: 'chevron.right',
              android: 'chevron_right',
              web: 'chevron_right',
            }}
            tintColor={theme.colors.textMuted}
            size={18}
            fallback={<Text style={styles.headerTitleChevron}>›</Text>}
          />
        </Pressable>
        <Pressable
          onPress={openMenu}
          hitSlop={12}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel={t('chat.menu')}
        >
          <SymbolView
            name={{
              ios: 'ellipsis.vertical',
              android: 'more_vert',
              web: 'more_vert',
            }}
            tintColor={theme.colors.text}
            size={22}
            fallback={<Text style={styles.headerFallback}>⋮</Text>}
          />
        </Pressable>
      </View>

      {messagingLocked ? (
        <View style={styles.blockBanner}>
          <Text style={styles.blockBannerText}>
            {t('chat.blockedBanner')}
          </Text>
          <Pressable
            onPress={() =>
              confirmUnblockUser(event.host, () => {
                void unblockUser(hostId);
              })
            }
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('chat.unblockLabel')}
          >
            <Text style={styles.blockBannerAction}>{t('chat.unblock')}</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={messages}
        extraData={messages}
        keyExtractor={(item) => item.id}
        style={styles.thread}
        contentContainerStyle={
          messages.length === 0 ? styles.threadEmpty : styles.threadContent
        }
        initialNumToRender={20}
        maxToRenderPerBatch={16}
        windowSize={9}
        removeClippedSubviews
        onContentSizeChange={() => scrollToLatest(false)}
        onLayout={() => scrollToLatest(false)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        ListEmptyComponent={
          <Text style={styles.emptyHint}>{t('chat.empty')}</Text>
        }
        renderItem={({ item }) => {
          const mine = item.role === 'me';
          const timeLabel = formatChatBubbleTime(item.at);
          const deletable = canDeleteMessage(item);
          const bubble = (
            <View
              style={[
                styles.bubbleRow,
                mine ? styles.bubbleRowMine : styles.bubbleRowOther,
              ]}
            >
              {!mine ? (
                <Pressable
                  onPress={() => openSenderProfile(item)}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.openProfileLabel', {
                    name: item.name,
                  })}
                >
                  <Text style={styles.author}>{item.name}</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => openSenderProfile(item)}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.openOwnProfileLabel')}
                >
                  <Text style={styles.authorMine}>{item.name}</Text>
                </Pressable>
              )}
              <View
                style={[
                  styles.bubbleCluster,
                  mine && styles.bubbleClusterMine,
                ]}
              >
                <Pressable
                  onPress={() => openSenderProfile(item)}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.openProfileLabel', {
                    name: mine ? t('chat.me') : item.name,
                  })}
                  hitSlop={6}
                >
                  <HostAvatar
                    name={item.name}
                    imageUri={
                      mine
                        ? userProfile.imageUri || item.imageUri
                        : item.imageUri
                    }
                    gender={
                      mine &&
                      (userProfile.gender === '男性' ||
                        userProfile.gender === '女性')
                        ? userProfile.gender
                        : undefined
                    }
                    size={28}
                  />
                </Pressable>
                <View
                  style={[
                    styles.bubbleWithTime,
                    mine && styles.bubbleWithTimeMine,
                  ]}
                >
                  {mine && timeLabel ? (
                    <Text
                      style={styles.bubbleTime}
                      accessibilityLabel={t('chat.sentAtLabel', { time: timeLabel })}
                    >
                      {timeLabel}
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
                  {!mine && timeLabel ? (
                    <Text
                      style={styles.bubbleTime}
                      accessibilityLabel={t('chat.sentAtLabel', { time: timeLabel })}
                    >
                      {timeLabel}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          );

          if (!deletable) return bubble;

          return (
            <Swipeable
              friction={2}
              rightThreshold={40}
              overshootRight={false}
              enabled={deletingId !== item.id}
              containerStyle={styles.swipeable}
              childrenContainerStyle={styles.swipeableChildren}
              renderRightActions={() => (
                <View style={styles.deleteActionWrap}>
                  <Pressable
                    onPress={() => confirmDeleteMessage(item)}
                    style={({ pressed }) => [
                      styles.deleteAction,
                      pressed && styles.deleteActionPressed,
                      deletingId === item.id && styles.deleteActionDisabled,
                    ]}
                    disabled={deletingId === item.id}
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.deleteMessageLabel')}
                  >
                    {deletingId === item.id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.deleteActionText}>{t('chat.delete')}</Text>
                    )}
                  </Pressable>
                </View>
              )}
            >
              {bubble}
            </Swipeable>
          );
        }}
      />

      {emojiOpen && !messagingLocked ? (
        <View style={styles.emojiBar}>
          {EMOJIS.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => setDraft((prev) => `${prev}${emoji}`)}
              style={styles.emojiBtn}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {messagingLocked ? (
        <View
          style={[
            styles.lockedBar,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <Text style={styles.lockedText}>
            {t('chat.lockedBar')}
          </Text>
        </View>
      ) : (
        <View
          style={[
            styles.composer,
            {
              // キーボード表示中はホームインジケータ余白を足さない（二重余白で浮き上がりすぎるのを防ぐ）
              paddingBottom: keyboardOpen
                ? 10
                : Math.max(insets.bottom, 10),
            },
          ]}
        >
        <Pressable
          style={styles.circleBtn}
          onPress={() =>
            Alert.alert(t('chat.voiceTitle'), t('chat.voiceSoon'))
          }
          accessibilityLabel={t('chat.voiceTitle')}
        >
          <SymbolView
            name={{ ios: 'mic', android: 'mic', web: 'mic' }}
            tintColor={theme.colors.text}
            size={22}
            fallback={<Text style={styles.composerFallback}>🎤</Text>}
          />
        </Pressable>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={t('chat.placeholder')}
          placeholderTextColor={theme.colors.textMuted}
          returnKeyType="send"
          onSubmitEditing={() => send()}
          blurOnSubmit={false}
          onFocus={() => scrollToLatestAfterKeyboard()}
        />
        <Pressable
          style={styles.iconBtn}
          onPress={() => setEmojiOpen((open) => !open)}
          accessibilityLabel={t('chat.emoji')}
        >
          <SymbolView
            name={{
              ios: 'face.smiling',
              android: 'mood',
              web: 'mood',
            }}
            tintColor={theme.colors.text}
            size={24}
            fallback={<Text style={styles.composerFallback}>☺</Text>}
          />
        </Pressable>
        {draft.trim() || sending ? (
          <Pressable
            style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
            onPress={() => send()}
            disabled={sending}
            accessibilityLabel={t('chat.send')}
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.sendText}>{t('chat.send')}</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={styles.circleBtn}
            onPress={() =>
              Alert.alert(t('chat.attachTitle'), t('chat.attachSoon'))
            }
            accessibilityLabel={t('chat.attachTitle')}
          >
            <SymbolView
              name={{
                ios: 'plus.circle',
                android: 'add_circle',
                web: 'add_circle',
              }}
              tintColor={theme.colors.text}
              size={26}
              fallback={<Text style={styles.composerFallback}>＋</Text>}
            />
          </Pressable>
        )}
      </View>
      )}
    </KeyboardAvoidingScreen>
    <AttendeeProfileOverlay
      visible={profileTarget != null}
      mode="profile"
      attendees={profileTarget ? [profileTarget] : []}
      selected={profileTarget}
      clubs={profileClubs}
      clubsLoading={profileClubsLoading}
      onClose={() => {
        setProfileTarget(null);
        setProfileLoading(false);
      }}
      onSelect={() => {}}
      onOpenClub={(clubId) => {
        setProfileTarget(null);
        router.push(clubHref(clubId) as never);
      }}
      eventHost={{ host: event.host, hostId }}
      isBlocked={
        profileTarget && !profileTarget.self
          ? isBlocked(profileTarget.id)
          : false
      }
      onBlock={(person) => {
        confirmBlockUser(person.name, () => {
          void blockUser({
            id: person.id,
            name: person.name,
            imageUri: person.imageUri,
              });
          setProfileTarget(null);
        });
      }}
      onUnblock={(person) => {
        confirmUnblockUser(person.name, () => {
          void unblockUser(person.id);
          setProfileTarget(null);
        });
      }}
    />
    {profileLoading ? (
      <View style={styles.profileLoading} pointerEvents="none">
        <ActivityIndicator color="#FFFFFF" />
      </View>
    ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  flex: {
    flex: 1,
  },
  profileLoading: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 10,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleHit: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: theme.radius.sm,
  },
  headerAvatar: {
    width: HEADER_AVATAR_SIZE,
    height: HEADER_AVATAR_SIZE,
    borderRadius: HEADER_AVATAR_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerAvatarImage: {
    width: HEADER_AVATAR_SIZE,
    height: HEADER_AVATAR_SIZE,
    borderRadius: HEADER_AVATAR_SIZE / 2,
  },
  headerTitleHitPressed: {
    backgroundColor: theme.colors.surfaceAlt,
  },
  headerTitleCol: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  headerSub: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  headerTitleChevron: {
    fontSize: 20,
    fontWeight: '500',
    color: theme.colors.textMuted,
    marginTop: -1,
  },
  headerFallback: {
    fontSize: 22,
    color: theme.colors.text,
  },
  blockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FEF2F2',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#FECACA',
  },
  blockBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.danger,
    lineHeight: 18,
  },
  blockBannerAction: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.text,
  },
  lockedBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: theme.colors.surfaceAlt,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  lockedText: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  thread: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  threadContent: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 10,
  },
  threadEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyHint: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  bubbleRow: {
    maxWidth: '78%',
  },
  bubbleRowMine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  bubbleRowOther: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  swipeable: {
    alignSelf: 'stretch',
  },
  swipeableChildren: {
    alignItems: 'flex-end',
  },
  deleteActionWrap: {
    width: DELETE_ACTION_WIDTH,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  deleteAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  deleteActionPressed: {
    opacity: 0.85,
  },
  deleteActionDisabled: {
    opacity: 0.7,
  },
  deleteActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  author: {
    marginBottom: 4,
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  authorMine: {
    marginBottom: 4,
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  bubbleCluster: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  bubbleClusterMine: {
    flexDirection: 'row-reverse',
  },
  /** 吹き出し＋時刻（LINE風: 時刻は吹き出し下部の横） */
  bubbleWithTime: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexShrink: 1,
    maxWidth: '100%',
    gap: 4,
  },
  bubbleWithTimeMine: {
    flexDirection: 'row',
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '100%',
    flexShrink: 1,
  },
  bubbleMine: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#F2F3F5',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.text,
  },
  bubbleTextMine: {
    color: '#fff',
    fontWeight: '600',
  },
  bubbleTime: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '400',
    color: '#A0A4AB',
    marginBottom: 1,
    flexShrink: 0,
  },
  emojiBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  emojiBtn: {
    padding: 4,
  },
  emoji: {
    fontSize: 24,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    backgroundColor: theme.colors.surface,
  },
  circleBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 32,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerFallback: {
    fontSize: 18,
  },
  input: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    backgroundColor: '#F2F3F5',
    fontSize: 15,
    color: theme.colors.text,
  },
  sendBtn: {
    height: 36,
    minWidth: 56,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: theme.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.7,
  },
  sendText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
});
