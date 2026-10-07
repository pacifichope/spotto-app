/**
 * Expo 設定（Google Maps / 位置情報 / ネイティブ認証）
 *
 * Google Maps API キーは環境変数から読む（ハードコード禁止）。
 * 優先順:
 *   1) EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
 *   2) GOOGLE_MAPS_API_KEY（EAS Secret 用エイリアス）
 *
 * EAS Build では .env が .gitignore 対象のため届かないことがある。
 * → プロジェクト直下の .easignore で .env を許可するか、
 *   `eas secret:create --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value ...`
 *   で Secret を登録すること。
 * キーが空のまま prebuild すると react-native-maps が
 * AndroidManifest の com.google.android.geo.API_KEY を削除し、
 * 実機で「API key not found」クラッシュになる。
 */
const fs = require('fs');
const path = require('path');

/** prebuild / EAS 時にも .env の値が確実に入るようにする */
function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
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
      // 未設定または空文字のときは .env の値で埋める
      // （EAS が空文字を渡すと従来の == null 判定では上書きできなかった）
      if (key && !String(process.env[key] ?? '').trim()) {
        process.env[key] = val;
      }
    }
  } catch {
    // ignore
  }
}
loadEnvFile();

const GOOGLE_MAPS_API_KEY = String(
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    '',
).trim();

const isNativeBuildContext =
  process.env.EAS_BUILD === 'true' ||
  process.env.CI === 'true' ||
  process.argv.some((arg) =>
    /(?:^|\/)(prebuild|run:android|run:ios)(?:$|:)/.test(arg),
  );

if (!GOOGLE_MAPS_API_KEY) {
  const message =
    '[app.config] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY（または GOOGLE_MAPS_API_KEY）が未設定です。' +
    ' .env に設定するか、EAS Secret に登録してください。' +
    ' 未設定のまま Android ビルドすると Maps が「API key not found」でクラッシュします。';
  if (isNativeBuildContext) {
    throw new Error(message);
  }
  console.warn(message);
}
function reversedGoogleIosScheme(clientId) {
  const id = String(clientId || '').trim();
  const suffix = '.apps.googleusercontent.com';
  if (!id.endsWith(suffix)) return '';
  return `com.googleusercontent.apps.${id.slice(0, -suffix.length)}`;
}

const googleReversedScheme = reversedGoogleIosScheme(
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
);

/** Android package / 共通アプリ ID（Google Play・Firebase・LINE Android） */
const BUNDLE_ID = 'com.taiki.spotto';
/** iOS Bundle ID（Apple Developer で確保済み・Android と同値） */
const IOS_BUNDLE_ID = 'com.taiki.spotto';
/** アプリ本体のカスタムスキーム（Expo Linking / createURL の唯一のプライマリ） */
const APP_SCHEME = 'spotto';
/** 共有・Universal Links 用ドメイン */
const WEB_HOST = 'spotto.fun';
const WEB_HOST_WWW = 'www.spotto.fun';
/** LINE Login: line3rdp.<bundle id>（LINE アプリからの復帰用） */
const lineUrlScheme = `line3rdp.${IOS_BUNDLE_ID}`;
const lineChannelId = String(
  process.env.EXPO_PUBLIC_LINE_CHANNEL_ID || '',
).trim();

/** 本番 EAS プロファイルでは cleartext（HTTP）を無効化 */
const easBuildProfile = String(process.env.EAS_BUILD_PROFILE || '').trim();
const appEnv = String(process.env.APP_ENV || '').trim();
const isProductionEasProfile = easBuildProfile === 'production';
const isReleaseLikeEasProfile =
  easBuildProfile === 'production' ||
  easBuildProfile === 'preview' ||
  appEnv === 'production' ||
  appEnv === 'preview';
const allowCleartextTraffic = !isProductionEasProfile;

function isLocalOrLanApiUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return false;
  try {
    const { hostname } = new URL(value);
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '10.0.2.2' ||
      hostname === '::1'
    ) {
      return true;
    }
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function normalizeApiUrl(raw) {
  return String(raw || '')
    .trim()
    .replace(/\/$/, '');
}

/** 実機 / EAS 向けデフォルト（localhost の代わり） */
const DEFAULT_REMOTE_API_BASE_URL =
  'https://spotto-api-rupy.onrender.com';

/**
 * EAS / 実機向けに API ベース URL を確定する。
 * REMOTE を最優先。preview・production では localhost / LAN を拒否し HTTPS を焼く。
 */
function resolveApiUrlsForBuild() {
  const configured = normalizeApiUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
  const remote = normalizeApiUrl(process.env.EXPO_PUBLIC_API_BASE_URL_REMOTE);
  const auth = normalizeApiUrl(process.env.EXPO_PUBLIC_AUTH_API_URL);

  const pickPublicHttps = (...urls) =>
    urls.find(
      (url) =>
        url &&
        /^https:\/\//i.test(url) &&
        !isLocalOrLanApiUrl(url),
    ) || '';

  // REMOTE 最優先
  const preferredRemote =
    pickPublicHttps(remote, auth, configured) ||
    (!isLocalOrLanApiUrl(remote) && remote) ||
    DEFAULT_REMOTE_API_BASE_URL;

  if (isReleaseLikeEasProfile) {
    const resolved =
      pickPublicHttps(remote, auth, configured) ||
      [remote, auth, configured].find(
        (url) => url && !isLocalOrLanApiUrl(url),
      ) ||
      DEFAULT_REMOTE_API_BASE_URL;

    if (isLocalOrLanApiUrl(configured) && resolved !== configured) {
      console.log(
        `[app.config] ローカル API_BASE_URL をスキップし、ビルドには ${resolved} を埋め込みます。`,
      );
    }

    return {
      apiBaseUrl: resolved,
      apiBaseUrlRemote: pickPublicHttps(remote) || resolved,
      authApiUrl: auth && !isLocalOrLanApiUrl(auth) ? auth : '',
    };
  }

  // development / ローカル: シミュレータ用に localhost を残しつつ、REMOTE も焼く
  return {
    apiBaseUrl: configured || preferredRemote,
    apiBaseUrlRemote:
      pickPublicHttps(remote) || preferredRemote,
    authApiUrl: auth,
  };
}

const resolvedApiUrls = resolveApiUrlsForBuild();
// Babel / Metro が process.env.EXPO_PUBLIC_* をインライン化するため、解決結果を書き戻す
if (resolvedApiUrls.apiBaseUrl) {
  process.env.EXPO_PUBLIC_API_BASE_URL = resolvedApiUrls.apiBaseUrl;
}
if (resolvedApiUrls.apiBaseUrlRemote) {
  process.env.EXPO_PUBLIC_API_BASE_URL_REMOTE =
    resolvedApiUrls.apiBaseUrlRemote;
}
if (resolvedApiUrls.authApiUrl) {
  process.env.EXPO_PUBLIC_AUTH_API_URL = resolvedApiUrls.authApiUrl;
}

const API_BASE_URL = resolvedApiUrls.apiBaseUrl;
if (isProductionEasProfile && !API_BASE_URL) {
  console.warn(
    '[app.config] 本番ビルドで EXPO_PUBLIC_API_BASE_URL が未設定です。' +
      '決済・通知・LINE 認証などが失敗します。EAS Secret に本番 HTTPS URL を設定してください。',
  );
}
if (
  isProductionEasProfile &&
  API_BASE_URL &&
  /^http:\/\//i.test(API_BASE_URL)
) {
  console.warn(
    '[app.config] 本番ビルドの EXPO_PUBLIC_API_BASE_URL が http:// です。HTTPS を推奨します。',
  );
}
const googleServicesJsonPath = path.join(__dirname, 'google-services.json');
const googleServicesPlistPath = path.join(__dirname, 'GoogleService-Info.plist');
const hasGoogleServicesJson = fs.existsSync(googleServicesJsonPath);
const hasGoogleServicesPlist = fs.existsSync(googleServicesPlistPath);

/**
 * iOS CFBundleURLSchemes / Android intentFilters 用。
 * Expo の `scheme` には入れない（複数指定すると Linking 警告＆ createURL が不安定になる）。
 * OAuth 復帰用スキームのみ追加登録する。
 */
const extraUrlSchemes = [];
if (googleReversedScheme) extraUrlSchemes.push(googleReversedScheme);
if (lineUrlScheme) extraUrlSchemes.push(lineUrlScheme);
// Google iOS クライアントが bundle id スキームを要求する場合がある
if (!extraUrlSchemes.includes(IOS_BUNDLE_ID)) {
  extraUrlSchemes.push(IOS_BUNDLE_ID);
}

const iosUrlSchemes = [APP_SCHEME, ...extraUrlSchemes];

const plugins = [
  'expo-router',
  './plugins/withJapaneseImageCropperStrings',
  // RN 0.86 公式 Gradle 9.3.1 + 検出できた JDK 17 を org.gradle.java.home に固定
  ['./plugins/withAndroidGradlePin', { version: '9.3.1' }],
  [
    'expo-splash-screen',
    {
      image: './assets/images/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#E6F4FE',
    },
  ],
  [
    'expo-secure-store',
    {
      configureAndroidBackup: true,
      faceIDPermission:
        'ログイン情報を保護するために、Face ID の使用を許可してください。',
    },
  ],
  [
    'expo-location',
    {
      locationWhenInUsePermission:
        '周辺のスポーツイベントを地図に表示するために、現在地を使用します。',
    },
  ],
  'expo-localization',
  [
    'expo-image-picker',
    {
      photosPermission:
        'プロフィール写真やイベントの写真を選ぶために、フォトライブラリへのアクセスが必要です。',
      cameraPermission:
        'イベントの写真を撮影するためにカメラへのアクセスが必要です。',
      microphonePermission: false,
    },
  ],
  [
    'expo-notifications',
    {
      color: '#2ED573',
      defaultChannel: 'default',
      enableBackgroundRemoteNotifications: false,
    },
  ],
  [
    '@stripe/stripe-react-native',
    {
      merchantIdentifier: 'merchant.com.spotto.app',
      enableGooglePay: true,
    },
  ],
  [
    'react-native-maps',
    {
      iosGoogleMapsApiKey: GOOGLE_MAPS_API_KEY,
      androidGoogleMapsApiKey: GOOGLE_MAPS_API_KEY,
    },
  ],
  // Sign in with Apple（ネイティブ）
  'expo-apple-authentication',
  // LINE / Google / Firebase 向け（静的フレームワーク + New Architecture）
  [
    'expo-build-properties',
    {
      ios: {
        useFrameworks: 'static',
        newArchEnabled: true,
        deploymentTarget: '16.4',
      },
      android: {
        newArchEnabled: true,
        minSdkVersion: 24,
      },
    },
  ],
  // LINE Login SDK（AppDelegate の URL コールバック + Info.plist）
  '@xmartlabs/react-native-line',
  // 起動直後に LoginManager.setup（URL 処理やログアウトより前）
  ['./plugins/withLineSdkSetup', { channelId: lineChannelId }],
];

// Firebase Auth（電話番号 SMS）。google-services があるときだけプラグインを有効化
// （ファイル無しでプラグインだけ入れると prebuild が失敗するため）
if (hasGoogleServicesJson || hasGoogleServicesPlist) {
  plugins.push('@react-native-firebase/app');
  plugins.push('@react-native-firebase/auth');
  if (!hasGoogleServicesJson) {
    console.warn(
      '[app.config] Firebase: Android 用 google-services.json が未配置です。Android 実機ビルド前に配置してください。',
    );
  }
  if (!hasGoogleServicesPlist) {
    console.warn(
      '[app.config] Firebase: iOS 用 GoogleService-Info.plist が未配置です。iOS 実機ビルド前に配置してください。',
    );
  }
} else {
  console.warn(
    '[app.config] Firebase: google-services.json / GoogleService-Info.plist が未配置です。\n' +
      '  → Firebase Console からダウンロードしてプロジェクトルートへ配置後、`node scripts/check-firebase-build.mjs` で確認し、Dev Client を再ビルドしてください。',
  );
}

// Google Sign-In（Firebase なし）
// - iOS: iosUrlScheme（逆引きクライアント ID）が必須
// - Android: package=com.taiki.spotto + SHA-1 を Google Cloud の Android クライアントに登録
//   SDK 側は webClientId で ID トークンを取得（EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID）
if (googleReversedScheme) {
  plugins.push([
    '@react-native-google-signin/google-signin',
    { iosUrlScheme: googleReversedScheme },
  ]);
} else if (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
  console.warn(
    '[app.config] Google Sign-In: EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID / WEB_CLIENT_ID から URL scheme を作れませんでした。',
  );
}

/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: 'spotto',
  // EAS プロジェクト（my-sports-app）の slug と一致させる
  slug: 'my-sports-app',
  owner: 'patto1',
  version: '1.0.1',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  // Linking.createURL / Expo Router 用は単一スキームのみ（配列にすると警告＆競合）
  scheme: APP_SCHEME,
  userInterfaceStyle: 'light',
  updates: {
    url: 'https://u.expo.dev/ac4216cc-7c71-428c-8214-6f15e49208fc',
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  ios: {
    supportsTablet: true,
    // Split View / Slide Over だと認可シートのプレゼンターが外れ、iPad 審査で
    // ログインボタンが無反応になる。全画面のまま横向きは Info.plist で許可する。
    requireFullScreen: true,
    bundleIdentifier: IOS_BUNDLE_ID,
    usesAppleSignIn: true,
    ...(hasGoogleServicesPlist
      ? { googleServicesFile: './GoogleService-Info.plist' }
      : {}),
    // Universal Links（https://spotto.fun/... → アプリ）
    associatedDomains: [
      `applinks:${WEB_HOST}`,
      `applinks:${WEB_HOST_WWW}`,
    ],
    // Google Sign-In (GIDSignIn) の Keychain エラー -34018 / Code=-2 対策
    entitlements: {
      'keychain-access-groups': [
        `$(AppIdentifierPrefix)${IOS_BUNDLE_ID}`,
      ],
    },
    config: {
      googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      // SecureStore / 標準暗号のみ → 輸出コンプライアンス質問を簡略化
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      CFBundleDisplayName: 'spotto',
      CFBundleName: 'spotto',
      // システム画像クロップ等の標準 UI を日本語寄りにする
      CFBundleDevelopmentRegion: 'ja',
      'UISupportedInterfaceOrientations~ipad': [
        'UIInterfaceOrientationPortrait',
        'UIInterfaceOrientationPortraitUpsideDown',
        'UIInterfaceOrientationLandscapeLeft',
        'UIInterfaceOrientationLandscapeRight',
      ],
      CFBundleURLTypes: [
        {
          CFBundleURLName: APP_SCHEME,
          CFBundleURLSchemes: iosUrlSchemes,
        },
      ],
      // LINE アプリを起動してログインするために必要
      LSApplicationQueriesSchemes: ['lineauth2'],
      NSLocationWhenInUseUsageDescription:
        '周辺のスポーツイベントを地図に表示するために、現在地を使用します。',
      NSPhotoLibraryUsageDescription:
        'プロフィール写真やイベントの写真を選ぶために、フォトライブラリへのアクセスが必要です。',
      NSCameraUsageDescription:
        'イベントの写真を撮影するためにカメラへのアクセスが必要です。',
      NSFaceIDUsageDescription:
        'ログイン情報を保護するために、Face ID の使用を許可してください。',
      // 開発中の LAN HTTP（http://192.168.x.x:8787）を許可
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
      },
    },
  },
  android: {
    // Google / LINE のコンソール登録と一致させる（iOS Bundle ID と同値）
    package: BUNDLE_ID,
    // Play Store 提出用（前回 EAS remote が 4 → 今回 5）
    versionCode: 5,
    // adjustResize 相当。キーボード表示時にウィンドウをリサイズし、
    // ChatRoom の KeyboardAvoidingView（Android: height）と併用して入力欄を隠さない。
    softwareKeyboardLayoutMode: 'resize',
    ...(hasGoogleServicesJson
      ? { googleServicesFile: './google-services.json' }
      : {}),
    // 本番では cleartext 無効。開発 / preview はローカル API 用に許可
    usesCleartextTraffic: allowCleartextTraffic,
    intentFilters: [
      // カスタムスキーム: spotto://event/...
      {
        action: 'VIEW',
        autoVerify: false,
        data: [{ scheme: APP_SCHEME }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
      // OAuth 復帰用（Google bundle id / LINE）
      ...extraUrlSchemes.map((scheme) => ({
        action: 'VIEW',
        autoVerify: false,
        data: [{ scheme }],
        category: ['BROWSABLE', 'DEFAULT'],
      })),
      // Android App Links: https://spotto.fun/event/...
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'https',
            host: WEB_HOST,
            pathPrefix: '/event',
          },
          {
            scheme: 'https',
            host: WEB_HOST_WWW,
            pathPrefix: '/event',
          },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
      // クラブ詳細なども App Link で開けるようにする
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'https',
            host: WEB_HOST,
            pathPrefix: '/club',
          },
          {
            scheme: 'https',
            host: WEB_HOST_WWW,
            pathPrefix: '/club',
          },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    // Android 11+ で LINE / mailto 起動を許可（パッケージ可視性）
    manifestQueries: {
      package: ['jp.naver.line.android'],
      intent: [
        {
          action: 'VIEW',
          data: { scheme: 'lineauth2' },
        },
        {
          action: 'VIEW',
          data: { scheme: 'mailto' },
        },
      ],
    },
    adaptiveIcon: {
      // アイコン本体がグラデーション付きフルブリードのため、背景色は端の逃げ用
      backgroundColor: '#4FC3DC',
      foregroundImage: './assets/images/android-icon-foreground.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'INTERNET',
      'CAMERA',
      'READ_MEDIA_IMAGES',
      'READ_EXTERNAL_STORAGE',
    ],
    config: {
      googleMaps: {
        apiKey: GOOGLE_MAPS_API_KEY,
      },
    },
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins,
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: 'ac4216cc-7c71-428c-8214-6f15e49208fc',
    },
    router: {
      // Universal Links / Web と Expo Router のパス対応原点
      origin: `https://${WEB_HOST}`,
    },
    appScheme: APP_SCHEME,
    webHost: WEB_HOST,
    lineChannelId: lineChannelId || undefined,
    androidPackage: BUNDLE_ID,
    iosBundleId: IOS_BUNDLE_ID,
    googleAndroidClientId:
      String(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '').trim() ||
      undefined,
    // ランタイム（lib/env.ts）が process.env 欠落時に読む
    apiBaseUrl: resolvedApiUrls.apiBaseUrl || undefined,
    apiBaseUrlRemote: resolvedApiUrls.apiBaseUrlRemote || undefined,
    authApiUrl: resolvedApiUrls.authApiUrl || undefined,
    useLocalApi:
      String(process.env.EXPO_PUBLIC_USE_LOCAL_API || '').trim() || undefined,
    easBuildProfile: easBuildProfile || undefined,
    appEnv: appEnv || undefined,
    // 審査・デモ撮影向けカタログ。オフにするときは EXPO_PUBLIC_SHOW_DEMO_EVENTS=0
    showDemoEvents:
      String(
        process.env.EXPO_PUBLIC_SHOW_DEMO_EVENTS ||
          (isReleaseLikeEasProfile ? '1' : ''),
      ).trim() || undefined,
  },
};

module.exports = { expo: config };
