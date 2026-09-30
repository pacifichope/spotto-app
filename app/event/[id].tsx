import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import EventDetailSheet from '@/components/EventDetailSheet';
import { theme } from '@/constants/theme';
import { clubHref } from '@/lib/clubNavigation';
import { useEvents } from '@/lib/eventsContext';

export default function EventDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    events,
    joinedIds,
    toggleJoin,
    isParticipating,
    ensureRemoteEvent,
    eventsLoading,
  } = useEvents();
  const eventId = Array.isArray(id) ? id[0] : id;
  const fromList = events.find((item) => item.id === eventId) ?? null;
  const [remoteEvent, setRemoteEvent] = useState(fromList);
  const [loadingRemote, setLoadingRemote] = useState(false);

  useEffect(() => {
    setRemoteEvent(fromList);
  }, [fromList]);

  useEffect(() => {
    let cancelled = false;
    if (!eventId || fromList) return;
    setLoadingRemote(true);
    void (async () => {
      const loaded = await ensureRemoteEvent(eventId);
      if (!cancelled) {
        setRemoteEvent(loaded);
        setLoadingRemote(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, fromList, ensureRemoteEvent]);

  const event = fromList ?? remoteEvent;
  const joined = event
    ? joinedIds.has(event.id) || isParticipating(event.id)
    : false;

  const close = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/home');
  };

  if (!event && (loadingRemote || eventsLoading)) {
    return (
      <View style={styles.missing}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.missingBody}>イベントを読み込んでいます…</Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingTitle}>イベントが見つかりません</Text>
        <Text style={styles.missingBody}>
          リンクのイベントは削除されたか、この端末ではまだ表示できません。
        </Text>
        <Pressable style={styles.homeBtn} onPress={close}>
          <Text style={styles.homeBtnText}>ホームに戻る</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <EventDetailSheet
        event={event}
        joined={joined}
        onClose={close}
        // シート側はフォーカス開催回 id で context.toggleJoin する（ルート id に閉じない）
        onToggleJoin={(options) => toggleJoin(event.id, options)}
        onOpenClub={(clubId) => router.push(clubHref(clubId))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: theme.colors.surfaceAlt,
    gap: 10,
  },
  missingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  missingBody: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  homeBtn: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
  },
  homeBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
});
