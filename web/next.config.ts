import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const webDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(webDir, '..');

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/** web/.env* とリポジトリルート .env をマージ（NEXT_PUBLIC を優先、無ければ EXPO_PUBLIC） */
function resolvePublicEnv(name: string, expoName?: string): string {
  const files = [
    parseEnvFile(path.join(webDir, '.env.local')),
    parseEnvFile(path.join(webDir, '.env')),
    parseEnvFile(path.join(rootDir, '.env.local')),
    parseEnvFile(path.join(rootDir, '.env')),
  ];
  const fromProcess = (process.env[name] || '').trim();
  if (fromProcess) return fromProcess;
  for (const file of files) {
    const direct = (file[name] || '').trim();
    if (direct) return direct;
  }
  if (expoName) {
    const fromExpoProcess = (process.env[expoName] || '').trim();
    if (fromExpoProcess) return fromExpoProcess;
    for (const file of files) {
      const expo = (file[expoName] || '').trim();
      if (expo) return expo;
    }
  }
  return '';
}

const publicEnv = {
  NEXT_PUBLIC_FIREBASE_API_KEY: resolvePublicEnv(
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'EXPO_PUBLIC_FIREBASE_API_KEY',
  ),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: resolvePublicEnv(
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  ),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: resolvePublicEnv(
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  ),
  NEXT_PUBLIC_FIREBASE_APP_ID: resolvePublicEnv(
    'NEXT_PUBLIC_FIREBASE_APP_ID',
    'EXPO_PUBLIC_FIREBASE_APP_ID',
  ),
  NEXT_PUBLIC_LINE_CHANNEL_ID: resolvePublicEnv(
    'NEXT_PUBLIC_LINE_CHANNEL_ID',
    'EXPO_PUBLIC_LINE_CHANNEL_ID',
  ),
  NEXT_PUBLIC_SUPABASE_URL: resolvePublicEnv(
    'NEXT_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_URL',
  ),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: resolvePublicEnv(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  ),
  NEXT_PUBLIC_API_BASE_URL: resolvePublicEnv(
    'NEXT_PUBLIC_API_BASE_URL',
    'EXPO_PUBLIC_API_BASE_URL_REMOTE',
  ),
  NEXT_PUBLIC_SITE_URL: resolvePublicEnv('NEXT_PUBLIC_SITE_URL') || 'https://spotto.fun',
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: resolvePublicEnv(
    'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
    'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY',
  ),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: resolvePublicEnv(
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST',
  ),
};

for (const [key, value] of Object.entries(publicEnv)) {
  if (value) process.env[key] = value;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: webDir,
  // クライアントバンドルへ確実に埋め込む（.env.local の読み漏れ対策）
  env: publicEnv,
};

export default nextConfig;
