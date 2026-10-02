import { Alert, Platform } from 'react-native';

import i18n from '@/lib/i18n';

export function getHostCancelTitle() {
  return i18n.t('join.hostCancelConfirmTitle');
}

export function getHostCancelMessage() {
  return i18n.t('join.hostCancelConfirmBody');
}

/** グループチャットに流す主催者都合の中止お知らせ */
export function getHostCancelChatMessage() {
  return i18n.t('join.hostCancelChatMessage');
}

export function confirmHostCancelEvent(onConfirm: () => void) {
  const title = getHostCancelTitle();
  const message = getHostCancelMessage();
  if (Platform.OS === 'web') {
    if (
      typeof window !== 'undefined' &&
      window.confirm(`${title}\n\n${message}`)
    ) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: i18n.t('common.back'), style: 'cancel' },
    {
      text: i18n.t('join.hostCancelConfirmAction'),
      style: 'destructive',
      onPress: onConfirm,
    },
  ]);
}
