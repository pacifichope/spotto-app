/** Web ではネイティブ Firebase 初期化は不要 */
export function isNativeFirebaseLinked() {
  return false;
}

export async function ensureNativeFirebaseApp() {
  return false;
}

export function ensureNativeFirebaseAppSync() {
  return false;
}

export {};
