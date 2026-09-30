import { Pressable, StyleSheet, Text, View } from 'react-native';

import AttendeeAvatarWithBadges from '@/components/AttendeeAvatarWithBadges';
import { theme } from '@/constants/theme';
import {
  attendeePreviewLabel,
  attendeeTicketQuantity,
  isEventHostAttendee,
  type EventAttendee,
} from '@/lib/attendees';

const MAX_FACES = 6;
const AVATAR_SIZE = 34;
const OVERLAP = 10;

type EventHostRef = {
  host: string;
  hostId?: string;
};

type EventAttendeesRowProps = {
  attendees: EventAttendee[];
  /** 主催者判定用（participant.id == event.hostId など） */
  eventHost?: EventHostRef | null;
  onPressAttendee: (attendee: EventAttendee) => void;
  onPressOverflow: () => void;
};

export default function EventAttendeesRow({
  attendees,
  eventHost = null,
  onPressAttendee,
  onPressOverflow,
}: EventAttendeesRowProps) {
  if (attendees.length === 0) {
    return (
      <Text style={styles.empty}>まだ参加者はいません。最初の一人になれます。</Text>
    );
  }

  const overflow = Math.max(0, attendees.length - MAX_FACES);
  const visible =
    overflow > 0 ? attendees.slice(0, MAX_FACES - 1) : attendees;

  return (
    <View style={styles.wrap}>
      <View style={styles.faces}>
        {visible.map((person, index) => {
          const isHost =
            eventHost != null && isEventHostAttendee(person, eventHost);
          const qty = attendeeTicketQuantity(person);
          return (
            <Pressable
              key={person.id}
              onPress={() => onPressAttendee(person)}
              style={[
                styles.face,
                { marginLeft: index === 0 ? 0 : -OVERLAP, zIndex: index + 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${person.self ? '自分' : person.name}のプロフィール${isHost ? '（主催）' : ''}${qty > 1 ? `、チケット${qty}枚` : ''}`}
            >
              <AttendeeAvatarWithBadges
                attendee={person}
                size={AVATAR_SIZE}
                showHostBadge={isHost}
              />
            </Pressable>
          );
        })}
        {overflow > 0 ? (
          <Pressable
            onPress={onPressOverflow}
            style={[
              styles.face,
              { marginLeft: -OVERLAP, zIndex: visible.length + 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`他${overflow + 1}名の参加者を見る`}
          >
            <View style={styles.overflow}>
              <Text style={styles.overflowText}>+{overflow + 1}</Text>
            </View>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        onPress={onPressOverflow}
        accessibilityRole="button"
        accessibilityLabel="参加者一覧を開く"
      >
        <Text style={styles.preview} numberOfLines={1}>
          {attendeePreviewLabel(attendees)}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    gap: 8,
  },
  faces: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  face: {
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: theme.colors.surface,
  },
  overflow: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
    borderColor: theme.colors.surface,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.primaryDark,
  },
  preview: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  empty: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
});
