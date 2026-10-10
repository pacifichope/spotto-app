#!/usr/bin/env node
/**
 * Firebase / Google Sign-In / Dev Client セットアップ確認
 * 使い方: npm run check:firebase
 */
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const EXPECTED_PACKAGE = 'com.taiki.spotto';

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

function normalizeSha1(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
}

function formatSha1(hex) {
  const clean = normalizeSha1(hex);
  if (clean.length !== 40) return hex || '';
  return clean.match(/.{1,2}/g).join(':').toUpperCase();
}

function readDebugKeystoreSha1() {
  const keystore = path.join(os.homedir(), '.android', 'debug.keystore');
  if (!fs.existsSync(keystore)) return null;
  try {
    const out = execSync(
      `keytool -list -v -keystore "${keystore}" -alias androiddebugkey -storepass android -keypass android`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const match = out.match(/SHA1:\s*([0-9A-Fa-f:]+)/i);
    return match ? normalizeSha1(match[1]) : null;
  } catch {
    return null;
  }
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

let webClientFromGs = '';
let androidHashes = [];

if (!hasJson) {
  issues.push(
    'google-services.json がプロジェクトルートにありません（Android 必須）',
  );
} else {
  try {
    const gs = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const clients = Array.isArray(gs?.client) ? gs.client : [];
    const client =
      clients.find(
        (row) =>
          row?.client_info?.android_client_info?.package_name ===
          EXPECTED_PACKAGE,
      ) || clients[0];
    const oauth = client?.oauth_client || [];
    const pkg =
      client?.client_info?.android_client_info?.package_name || '(unknown)';
    const packages = clients
      .map((row) => row?.client_info?.android_client_info?.package_name)
      .filter(Boolean);
    if (!packages.includes(EXPECTED_PACKAGE)) {
      issues.push(
        `google-services.json に package_name=${EXPECTED_PACKAGE} のクライアントがありません（検出: ${packages.join(', ') || 'なし'}）。Firebase に Android アプリを追加し JSON を再配置してください。`,
      );
    } else {
      hints.push(
        `google-services.json: ${EXPECTED_PACKAGE} クライアントあり（全 package: ${packages.join(', ')}）`,
      );
    }
    if (pkg !== EXPECTED_PACKAGE && packages.includes(EXPECTED_PACKAGE)) {
      // 先頭が旧 package でも、期待 package のエントリがあれば OK
    } else if (pkg !== EXPECTED_PACKAGE) {
      issues.push(
        `google-services.json の解析対象 package_name が ${pkg} です（期待: ${EXPECTED_PACKAGE}）`,
      );
    }
    if (!Array.isArray(oauth) || oauth.length === 0) {
      issues.push(
        `google-services.json の oauth_client が空です（package=${pkg}）。` +
          'Firebase に登録した SHA が別 GCP プロジェクトの Android OAuth クライアントと衝突している可能性が高いです。',
      );
    } else {
      const type3 = oauth.find((o) => o.client_type === 3);
      const type1 = oauth.filter((o) => o.client_type === 1);
      webClientFromGs = type3?.client_id || '';
      androidHashes = type1
        .map((o) => normalizeSha1(o.android_info?.certificate_hash))
        .filter(Boolean);
      hints.push(
        `google-services.json oauth_client: ${oauth.length} 件（package=${pkg}）`,
      );
      if (!webClientFromGs) {
        issues.push(
          'google-services.json に client_type=3（Web）OAuth クライアントがありません。Google Sign-In の webClientId に必要です。',
        );
      } else {
        hints.push(`Web client_id (type 3): ${webClientFromGs}`);
      }
      if (androidHashes.length === 0) {
        issues.push(
          'google-services.json に Android OAuth（client_type=1 + certificate_hash）がありません。Firebase に SHA-1 を追加し、JSON を再ダウンロードしてください。',
        );
      } else {
        hints.push(
          `登録済み Android SHA-1: ${androidHashes.map(formatSha1).join(', ')}`,
        );
      }
    }
  } catch (error) {
    issues.push(
      `google-services.json の解析に失敗: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

const webClientEnv = String(env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '').trim();
if (!webClientEnv) {
  issues.push(
    '.env に EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID が未設定です（Google Sign-In 必須・Web クライアント）',
  );
} else if (webClientFromGs && webClientEnv !== webClientFromGs) {
  issues.push(
    'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID が google-services.json の Web クライアント (type 3) と一致しません。DEVELOPER_ERROR の典型原因です。',
  );
} else if (webClientEnv) {
  hints.push('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID は google-services.json の type 3 と一致');
}

const debugSha = readDebugKeystoreSha1();
if (debugSha) {
  hints.push(`ローカル debug.keystore SHA-1: ${formatSha1(debugSha)}`);
  if (androidHashes.length > 0 && !androidHashes.includes(debugSha)) {
    issues.push(
      'debug.keystore の SHA-1 が google-services.json にありません。Firebase Console → プロジェクト設定 → Android アプリに debug SHA-1 を追加し、google-services.json を再配置してください。' +
        '（未登録のままだと Android で DEVELOPER_ERROR / code 10 になります）',
    );
  }
} else {
  hints.push(
    '【Android DEVELOPER_ERROR 注意】~/.android/debug.keystore が無い／SHA-1 未取得です。' +
      '`npx expo run:android` 後に keytool で SHA-1 を取り、Firebase（com.taiki.spotto）へ登録してください。' +
      'EAS は `eas credentials -p android`。詳細: docs/AUTH_TROUBLESHOOTING.md',
  );
}

hints.push(
  'EAS / Play 本番: `eas credentials -p android` の SHA-1 も Firebase に登録が必要（未登録だと DEVELOPER_ERROR）',
);
hints.push('詳細: docs/AUTH_TROUBLESHOOTING.md');

if (!hasPlist) {
  issues.push(
    'GoogleService-Info.plist がプロジェクトルートにありません（iOS 必須）',
  );
} else {
  try {
    const plist = fs.readFileSync(plistPath, 'utf8');
    const bundleMatch = plist.match(
      /<key>BUNDLE_ID<\/key>\s*<string>([^<]+)<\/string>/,
    );
    const clientMatch = plist.match(
      /<key>CLIENT_ID<\/key>\s*<string>([^<]+)<\/string>/,
    );
    const appIdMatch = plist.match(
      /<key>GOOGLE_APP_ID<\/key>\s*<string>([^<]+)<\/string>/,
    );
    const plistBundle = bundleMatch?.[1]?.trim() || '';
    const plistClient = clientMatch?.[1]?.trim() || '';
    const plistAppId = appIdMatch?.[1]?.trim() || '';
    if (!plistBundle) {
      issues.push('GoogleService-Info.plist に BUNDLE_ID がありません');
    } else if (plistBundle !== EXPECTED_PACKAGE) {
      issues.push(
        `GoogleService-Info.plist の BUNDLE_ID が ${plistBundle} です（期待: ${EXPECTED_PACKAGE}）。` +
          'Firebase Console で iOS アプリ（Bundle ID = com.taiki.spotto）の GoogleService-Info.plist を再ダウンロードして置き換えてください。' +
          '不一致のままだと App Store 審査の iPad で Google / Firebase ログインが失敗します。',
      );
    } else {
      hints.push(`GoogleService-Info.plist BUNDLE_ID: ${plistBundle}`);
    }
    const iosClientEnv = String(
      env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
    ).trim();
    const androidClientEnv = String(
      env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '',
    ).trim();
    const plistAndroidClient =
      (
        plist.match(
          /<key>ANDROID_CLIENT_ID<\/key>\s*<string>([^<]+)<\/string>/,
        ) || []
      )[1]?.trim() || '';
    if (plistClient) {
      hints.push(`GoogleService-Info.plist CLIENT_ID: ${plistClient}`);
    }
    if (!iosClientEnv) {
      issues.push(
        '.env に EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID が未設定です（iOS Google URL scheme 必須）',
      );
    } else if (plistClient && iosClientEnv !== plistClient) {
      issues.push(
        'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID が GoogleService-Info.plist の CLIENT_ID と一致しません。',
      );
    }
    if (
      androidClientEnv &&
      plistAndroidClient &&
      androidClientEnv !== plistAndroidClient
    ) {
      // plist の ANDROID_CLIENT_ID は com.taiki.spotto 向け。旧 com.spotto.app クライアントを指しているとレガシー AuthSession 経路が壊れる
      issues.push(
        'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID が GoogleService-Info.plist の ANDROID_CLIENT_ID と一致しません（package=com.taiki.spotto の Android OAuth を使ってください）。',
      );
    } else if (androidClientEnv && plistAndroidClient) {
      hints.push(
        'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID は plist ANDROID_CLIENT_ID と一致',
      );
    }
    if (plistAppId && !/:ios:/i.test(plistAppId)) {
      issues.push(
        `GoogleService-Info.plist の GOOGLE_APP_ID が iOS 用ではありません: ${plistAppId}`,
      );
    }
  } catch (error) {
    issues.push(
      `GoogleService-Info.plist の解析に失敗: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

const remoteApi = String(env.EXPO_PUBLIC_API_BASE_URL_REMOTE || '').trim();
if (!remoteApi) {
  issues.push(
    '.env に EXPO_PUBLIC_API_BASE_URL_REMOTE が未設定です（LINE → /auth/line-firebase）',
  );
} else {
  hints.push(
    `LINE API base: ${remoteApi} （デプロイ後 GET /health の service が spotto-api であること）`,
  );
}

const pkgJson = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
);
for (const dep of [
  'firebase',
  '@react-native-firebase/app',
  '@react-native-firebase/auth',
  '@react-native-google-signin/google-signin',
]) {
  if (!pkgJson.dependencies?.[dep]) {
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
  'Firebase Console → Authentication → Google / 電話番号 を有効化',
);

console.log('=== Firebase / Google Sign-In / Dev Client チェック ===\n');
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
