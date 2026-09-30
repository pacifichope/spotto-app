import { Alert, Platform } from 'react-native';

export const DELETE_ACCOUNT_TITLE = 'アカウントを削除しますか？';

export const DELETE_ACCOUNT_MESSAGE =
  'アカウントとこの端末に保存されたプロフィール、参加・主催データ、メッセージ、ブロックリストなどは削除されます。この操作は取り消せません。';

export function confirmDeleteAccount(onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (
      typeof window !== 'undefined' &&
      window.confirm(`${DELETE_ACCOUNT_TITLE}\n\n${DELETE_ACCOUNT_MESSAGE}`)
    ) {
      onConfirm();
    }
    return;
  }
  Alert.alert(DELETE_ACCOUNT_TITLE, DELETE_ACCOUNT_MESSAGE, [
    { text: 'キャンセル', style: 'cancel' },
    {
      text: '削除する',
      style: 'destructive',
      onPress: onConfirm,
    },
  ]);
}
