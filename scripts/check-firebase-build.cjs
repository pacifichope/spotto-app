#!/usr/bin/env node
/**
 * Dev Client / prebuild 前の Firebase 電話認証セットアップ確認
 * 使い方: node scripts/check-firebase-build.mjs
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');

function loadEnvFile(filePath) {
  const map = {};
  if (!fs.existsSync(filePath)) return map;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) map[key] = val;
  }
  return map;
}

const env = { ...loadEnvFile(envPath), ...process.env };
const requiredWeb = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];

const issues = [];
const hints = [];

for (const key of requiredWeb) {
  const val = String(env[key] || '').trim();
  if (!val || val.startsWith('YOUR_')) {
    issues.push(`.env に ${key} が未設定です（Web / 設定確認用）`);
  }
}

const jsonPath = path.join(root, 'google-services.json');
const plistPath = path.join(root, 'GoogleService-Info.plist');
const hasJson = fs.existsSync(jsonPath);
const hasPlist = fs.existsSync(plistPath);

if (!hasJson) {
  issues.push(
    'google-services.json がプロジェクトルートにありません（Android 必須）',
  );
} else {
  try {
    const gs = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const client = gs?.client?.[0];
    const oauth = client?.oauth_client || [];
    const pkg =
      client?.client_info?.android_client_info?.package_name || '(unknown)';
    if (!Array.isArray(oauth) || oauth.length === 0) {
      issues.push(
        `google-services.json の oauth_client が空です（package=${pkg}）。` +
          'Firebase に登録した SHA が別 GCP プロジェクトの Android OAuth クライアントと衝突している可能性が高いです。' +
          'Phone Auth / Play Integrity が失敗します。',
      );
    } else {
      hints.push(
        `google-services.json oauth_client: ${oauth.length} 件（package=${pkg}）`,
      );
    }
  } catch (error) {
    issues.push(
      `google-services.json の解析に失敗: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
if (!hasPlist) {
  issues.push(
    'GoogleService-Info.plist がプロジェクトルートにありません（iOS 必須）',
  );
}

const pkg = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
);
for (const dep of [
  'firebase',
  '@react-native-firebase/app',
  '@react-native-firebase/auth',
]) {
  if (!pkg.dependencies?.[dep]) {
    issues.push(`package.json に ${dep} がありません`);
  }
}

if (hasJson || hasPlist) {
  hints.push(
    'app.config.js は google-services 検出時に @react-native-firebase プラグインを有効化します',
  );
} else {
  hints.push(
    'google-services 未配置のため prebuild しても Firebase ネイティブは入りません',
  );
}

hints.push('Expo Go では動作しません。必ず Dev Client を再ビルドしてください');
hints.push(
  '例: npx expo prebuild --clean && npx expo run:ios --device  または  npm run android:device',
);
hints.push(
  'Firebase Console → Authentication → 電話番号 を有効化し、必要ならテスト用電話番号を登録',
);

console.log('=== Firebase Phone Auth / Dev Client チェック ===\n');
if (issues.length === 0) {
  console.log('OK: 実機ビルドに進める設定が揃っています。\n');
} else {
  console.log('要対応:');
  for (const item of issues) console.log(`  - ${item}`);
  console.log('');
}
console.log('メモ:');
for (const item of hints) console.log(`  - ${item}`);
console.log('');

process.exit(issues.length > 0 ? 1 : 0);
