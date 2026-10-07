/**
 * Next.js はクライアントへ `process.env.NEXT_PUBLIC_*` の静的参照だけを埋め込む。
 * `process.env[name]` のような動的アクセスはブラウザ側で常に空になる。
 */

export function supabaseUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
}

export function supabaseAnonKey() {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
}

export function apiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_BASE_URL || '').trim().replace(/\/+$/, '');
}

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://spotto.fun')
    .trim()
    .replace(/\/+$/, '');
}

export function googleMapsApiKey() {
  return (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim();
}

export function lineChannelId() {
  return (process.env.NEXT_PUBLIC_LINE_CHANNEL_ID || '').trim();
}

export function firebasePublicConfig() {
  return {
    apiKey: (process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '').trim(),
    authDomain: (process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '').trim(),
    projectId: (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '').trim(),
    appId: (process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '').trim(),
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
