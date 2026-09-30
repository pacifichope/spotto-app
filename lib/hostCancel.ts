import { Alert, Platform } from 'react-native';

export const HOST_CANCEL_TITLE = 'このイベントを中止しますか？';

export const HOST_CANCEL_MESSAGE =
  '参加者に中止が通知されます。有料イベントの参加費はキャンセルポリシーにかかわらず全額返金の手続きを開始します。この操作は取り消せません。';

/** グループチャットに流す主催者都合の中止お知らせ */
export const HOST_CANCEL_CHAT_MESSAGE = [
  '⚠️【イベント中止のお知らせ】',
  '主催者の都合により、誠に残念ながら本イベントは中止となりました。',
  'ご予定を空けていただいていた皆様にはご迷惑をおかけし、大変申し訳ございません。',
  '',
  'すでにお支払いいただいた参加費等がある場合は、順次返金の手続きを進めさせていただきます。また別の機会にご参加いただけますと幸いです。',
].join('\n');

export function confirmHostCancelEvent(onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (
      typeof window !== 'undefined' &&
      window.confirm(`${HOST_CANCEL_TITLE}\n\n${HOST_CANCEL_MESSAGE}`)
    ) {
      onConfirm();
    }
    return;
  }
  Alert.alert(HOST_CANCEL_TITLE, HOST_CANCEL_MESSAGE, [
    { text: '戻る', style: 'cancel' },
    {
      text: '中止する',
      style: 'destructive',
      onPress: onConfirm,
    },
  ]);
}
