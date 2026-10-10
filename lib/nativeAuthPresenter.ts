import { InteractionManager, Platform } from 'react-native';

/**
 * iPad / iOS で RN オーバーレイ直後にシステム認可シートを出すと
 * presenter が null になり、ログインが無反応・即失敗することがある。
 * 交互作用の完了を待ってから短い余白を置く。
 */
export function waitForNativeAuthPresenter(extraMs = 0): Promise<void> {
  const pad =
    Platform.OS === 'ios' && Platform.isPad
      ? Math.max(extraMs, 350)
      : Math.max(extraMs, 120);

  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      setTimeout(resolve, pad);
    });
  });
}
