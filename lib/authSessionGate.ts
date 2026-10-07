/**
 * 明示的なログアウト中は、Firebase がまだ旧ユーザーを返しても
 * プロフィールやチャットを画面へ戻さない。
 */
let explicitSignOut = false;

export function beginExplicitSignOut() {
  explicitSignOut = true;
}

export function endExplicitSignOut() {
  explicitSignOut = false;
}

export function isExplicitSignOut() {
  return explicitSignOut;
}
