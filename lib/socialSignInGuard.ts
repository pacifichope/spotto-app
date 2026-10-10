/**
 * ソーシャルログインの UI ガード。
 * ネイティブ認可シートが例外やハングで戻らなくても、ボタンの loading を必ず解除する。
 */
import type { AuthResult, SocialProvider } from '@/lib/auth';
import { waitForNativeAuthPresenter } from '@/lib/nativeAuthPresenter';
import {
  SOCIAL_LOGIN_USER_ERRORS,
  userFacingSocialLoginError,
} from '@/lib/socialLoginErrors';

/** システム認可 UI を操作中でも、これ以上戻らなければボタンを復帰させる */
export const SOCIAL_SIGN_IN_UI_TIMEOUT_MS = 90_000;

type RunGuardedSocialSignInParams = {
  provider: SocialProvider;
  busyRef: { current: boolean };
  setBusy: (busy: boolean) => void;
  signIn: (provider: SocialProvider) => Promise<AuthResult>;
  /** RN Modal を閉じてから認可シートを出す、など */
  beforeNativePrompt?: () => Promise<void>;
  showError: (message: string) => void;
  showBanned: (message: string) => void;
};

export type SocialSignInGuardOutcome =
  | { ignored: true }
  | { ignored: false; result: AuthResult | null };

/** 進行中の認可。タイムアウト後の再試行は許可し、古い呼び出しが新しいロックを消さないよう世代で分ける */
let nativePromptActive = false;
let promptGeneration = 0;

export async function runGuardedSocialSignIn({
  provider,
  busyRef,
  setBusy,
  signIn,
  beforeNativePrompt,
  showError,
  showBanned,
}: RunGuardedSocialSignInParams): Promise<SocialSignInGuardOutcome> {
  if (busyRef.current || nativePromptActive) return { ignored: true };
  const generation = ++promptGeneration;
  busyRef.current = true;
  nativePromptActive = true;
  setBusy(true);

  let timedOut = false;
  const timer = setTimeout(() => {
    if (generation !== promptGeneration) return;
    timedOut = true;
    nativePromptActive = false;
    busyRef.current = false;
    setBusy(false);
    showError(SOCIAL_LOGIN_USER_ERRORS.timeout);
  }, SOCIAL_SIGN_IN_UI_TIMEOUT_MS);

  try {
    if (beforeNativePrompt) {
      await beforeNativePrompt();
    }
    // iPad ではオーバーレイ描画直後の present が失敗しやすい
    await waitForNativeAuthPresenter();
    const result = await signIn(provider);
    if (timedOut) return { ignored: false, result };
    if (!result.ok && !result.cancelled) {
      if (result.banned) showBanned(result.error);
      else showError(userFacingSocialLoginError(provider, result.error));
    }
    return { ignored: false, result };
  } catch (error) {
    if (__DEV__) {
      console.warn('[auth] social sign-in', provider, error);
    }
    if (!timedOut) {
      showError(userFacingSocialLoginError(provider));
    }
    return { ignored: false, result: null };
  } finally {
    clearTimeout(timer);
    if (generation === promptGeneration) {
      nativePromptActive = false;
      if (!timedOut) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }
}
