/**
 * Expo 設定（Google Maps / 位置情報 / ネイティブ認証）
 *
 * Google Maps API キーは必ず環境変数 EXPO_PUBLIC_GOOGLE_MAPS_API_KEY から読む。
 * ハードコードしないこと。.env に設定し、Google Cloud Console で
 * Maps SDK for Android / iOS を有効化してください。
 */
const fs = require('fs');
const path = require('path');

/** prebuild 時にも .env の EXPO_PUBLIC_* が確実に入るようにする */
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
      if (key && process.env[key] == null) {
        process.env[key] = val;
      }
    }
  } catch {
    // ignore
  }
}
loadEnvFile();

const GOOGLE_MAPS_API_KEY = String(
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
).trim();
if (!GOOGLE_MAPS_API_KEY) {
  console.warn(
    '[app.config] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY が未設定です。.env に設定してください。地図・Places が動きません。',
  );
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

const BUNDLE_ID = 'com.spotto.app';
/** アプリ本体のカスタムスキーム（Expo Linking / createURL の唯一のプライマリ） */
const APP_SCHEME = 'spotto';
/** 共有・Universal Links 用ドメイン */
const WEB_HOST = 'spotto.fun';
const WEB_HOST_WWW = 'www.spotto.fun';
/** LINE Login iOS: line3rdp.<bundle id>（LINE アプリからの復帰用） */
const lineUrlScheme = `line3rdp.${BUNDLE_ID}`;
const lineChannelId = String(
  process.env.EXPO_PUBLIC_LINE_CHANNEL_ID || '',
).trim();

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
if (!extraUrlSchemes.includes(BUNDLE_ID)) extraUrlSchemes.push(BUNDLE_ID);

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
      backgroundColor: '#ffffff',
    },
  ],
  [
    'expo-location',
    {
      locationWhenInUsePermission:
        '周辺のスポーツイベントを地図に表示するために、現在地を使用します。',
    },
  ],
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
// - Android: package=com.spotto.app + SHA-1 を Google Cloud の Android クライアントに登録
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
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  // Linking.createURL / Expo Router 用は単一スキームのみ（配列にすると警告＆競合）
  scheme: APP_SCHEME,
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
    bundleIdentifier: BUNDLE_ID,
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
        `$(AppIdentifierPrefix)${BUNDLE_ID}`,
      ],
    },
    config: {
      googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    },
    infoPlist: {
      CFBundleDisplayName: 'spotto',
      CFBundleName: 'spotto',
      // システム画像クロップ等の標準 UI を日本語寄りにする
      CFBundleDevelopmentRegion: 'ja',
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
      NSLocationAlwaysAndWhenInUseUsageDescription:
        '周辺のスポーツイベントを地図に表示するために、現在地を使用します。',
      NSPhotoLibraryUsageDescription:
        'プロフィール写真やイベントの写真を選ぶために、フォトライブラリへのアクセスが必要です。',
      NSCameraUsageDescription:
        'イベントの写真を撮影するためにカメラへのアクセスが必要です。',
      // 開発中の LAN HTTP（http://192.168.x.x:8787）を許可
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
      },
    },
  },
  android: {
    // Google / LINE のコンソール登録と一致させる（iOS Bundle ID と同値）
    package: BUNDLE_ID,
    // adjustResize 相当。キーボード表示時にウィンドウをリサイズし、
    // ChatRoom の KeyboardAvoidingView（Android: height）と併用して入力欄を隠さない。
    softwareKeyboardLayoutMode: 'resize',
    ...(hasGoogleServicesJson
      ? { googleServicesFile: './google-services.json' }
      : {}),
    // ローカル API（http://LAN_IP:8787）への cleartext 通信を許可
    usesCleartextTraffic: true,
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
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'INTERNET',
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
    googleAndroidClientId:
      String(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '').trim() ||
      undefined,
  },
};

module.exports = { expo: config };
