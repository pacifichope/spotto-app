import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/constants/theme';

export function useTimedToast(durationMs = 2800) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, message]);

  return [message, setMessage] as const;
}

export default function SaveToast({
  message,
  bottomOffset = 96,
}: {
  message: string;
  bottomOffset?: number;
}) {
  if (!message) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { bottom: bottomOffset }]}
    >
      <View style={styles.card}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 40,
  },
  card: {
    maxWidth: '100%',
    backgroundColor: '#111827',
    borderRadius: theme.radius.lg,
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
});
