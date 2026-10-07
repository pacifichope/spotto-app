/**
 * Next.js はクライアントへ `process.env.NEXT_PUBLIC_*` の静的参照だけを埋め込む。
 * `process.env[name]` のような動的アクセスはブラウザ側で常に空になる。
 *
 * さらに、開発時のキャッシュずれ等で埋め込みが空になる場合に備え、
 * Root Layout（サーバー）から渡した値を runtime で優先する。
 */

export type FirebasePublicConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
};

function readPublic(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** バンドラが静的置換できるよう、プロパティアクセスはリテラルキーのみ使う */
const ENV_FIREBASE_API_KEY = readPublic(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
const ENV_FIREBASE_AUTH_DOMAIN = readPublic(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
const ENV_FIREBASE_PROJECT_ID = readPublic(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
const ENV_FIREBASE_APP_ID = readPublic(process.env.NEXT_PUBLIC_FIREBASE_APP_ID);

let runtimeFirebaseConfig: FirebasePublicConfig | null = null;

export function setRuntimeFirebaseConfig(config: FirebasePublicConfig | null | undefined) {
  if (!config) return;
  const next: FirebasePublicConfig = {
    apiKey: readPublic(config.apiKey),
    authDomain: readPublic(config.authDomain),
    projectId: readPublic(config.projectId),
    appId: readPublic(config.appId),
  };
  if (!next.apiKey && !next.authDomain && !next.projectId && !next.appId) return;
  runtimeFirebaseConfig = next;
}

export function supabaseUrl() {
  return readPublic(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, '');
}

export function supabaseAnonKey() {
  return readPublic(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function apiBaseUrl() {
  return readPublic(process.env.NEXT_PUBLIC_API_BASE_URL).replace(/\/+$/, '');
}

export function siteUrl() {
  return (readPublic(process.env.NEXT_PUBLIC_SITE_URL) || 'https://spotto.fun').replace(/\/+$/, '');
}

export function googleMapsApiKey() {
  return readPublic(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
}

export function lineChannelId() {
  return readPublic(process.env.NEXT_PUBLIC_LINE_CHANNEL_ID);
}

/**
 * LINE Developers に登録した Callback URL と完全一致させる。
 * 未設定時は SITE_URL（本番）またはブラウザの origin（ローカル）から組み立てる。
 * ※ Supabase の https://xxx.supabase.co/auth/v1/callback は使わない。
 */
export function lineRedirectUriFromEnv(): string {
  const explicit = readPublic(process.env.NEXT_PUBLIC_LINE_REDIRECT_URI);
  if (explicit) return explicit.replace(/\/+$/, '');
  return '';
}

export function firebasePublicConfig(): FirebasePublicConfig {
  const fromEnv: FirebasePublicConfig = {
    apiKey: ENV_FIREBASE_API_KEY,
    authDomain: ENV_FIREBASE_AUTH_DOMAIN,
    projectId: ENV_FIREBASE_PROJECT_ID,
    appId: ENV_FIREBASE_APP_ID,
  };
  const runtime = runtimeFirebaseConfig;
  if (!runtime) return fromEnv;
  return {
    apiKey: runtime.apiKey || fromEnv.apiKey,
    authDomain: runtime.authDomain || fromEnv.authDomain,
    projectId: runtime.projectId || fromEnv.projectId,
    appId: runtime.appId || fromEnv.appId,
  };
}

export function missingFirebaseEnvKeys() {
  const config = firebasePublicConfig();
  const missing: string[] = [];
  if (!config.apiKey) missing.push('NEXT_PUBLIC_FIREBASE_API_KEY');
  if (!config.authDomain) missing.push('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
  if (!config.projectId) missing.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  if (!config.appId) missing.push('NEXT_PUBLIC_FIREBASE_APP_ID');
  return missing;
}

export function isFirebaseConfigured() {
  return missingFirebaseEnvKeys().length === 0;
}
