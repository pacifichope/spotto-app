# 認証トラブルシューティング（Google / LINE）

## 0. App Store 審査 — Guideline 2.1(a)「ログインが全滅」（特に iPad）

審査端末（例: iPad Air / iPadOS）で Google・Apple・LINE がすべて使えない場合、次を **この順** で潰す。

### 最重要: `GoogleService-Info.plist` の Bundle ID

アプリの iOS Bundle ID は **`com.taiki.spotto`**。ルートの plist が旧 ID（`com.spotto.app`）のままだと、Firebase / Google Sign-In が審査ビルドで失敗する。

| 項目 | 期待値 |
|---|---|
| `app.config.js` / Xcode Bundle ID | `com.taiki.spotto` |
| `GoogleService-Info.plist` → `BUNDLE_ID` | `com.taiki.spotto`（**不一致はビルド前に必ず修正**） |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | 上記 plist の `CLIENT_ID` と同一（EAS Secret も同期） |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | plist `ANDROID_CLIENT_ID` / `com.taiki.spotto` の type=1（旧 `com.spotto.app` 不可） |
| Firebase Console | iOS アプリとして **`com.taiki.spotto`** が登録済み |

手順:

1. [Firebase Console](https://console.firebase.google.com/) → プロジェクト設定 → マイアプリ  
2. Bundle ID = `com.taiki.spotto` の iOS アプリを選ぶ（無ければ追加）  
3. `GoogleService-Info.plist` を再ダウンロードし、リポジトリルートへ上書き  
4. `.env` / EAS Secrets の `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` を新しい `CLIENT_ID` に合わせる  
5. `npm run check:firebase` が **OK** になるまで直す（BUNDLE_ID 不一致は exit 1）  
6. **EAS で iOS を再ビルド**してから再提出（plist はビルド時に埋め込まれる）

### アプリ側の iPad 対策（コード済み）

| 対策 | 内容 |
|---|---|
| ログイン UI | iPad では RN Modal を隠さずオーバーレイのまま認可シートを出す（空画面で固まるのを防止） |
| タッチ | シート `zIndex` / `elevation`、ボタン `minHeight: 52`、backdrop とシートの `pointerEvents` 分離 |
| presenter | `waitForNativeAuthPresenter` で InteractionManager 完了後に Google / Apple / LINE を開始 |
| LINE | iPad は最初から `onlyWebLogin: true`。それ以外は失敗時に Web ログインへフォールバック |
| loading | 認可が戻らなくても 90 秒でボタン復帰（`socialSignInGuard`） |

### 再提出前の実機確認

- **iPad**（または iPad シミュレータ）でクリーンインストール後、Google / Apple / LINE のそれぞれでログインできること  
- 審査メモ例: 「デモ用にメールログインは無く、Google・Sign in with Apple・LINE のいずれでも利用できます。審査用アカウントが必要な場合は Reply でお知らせください。」

---

## 1. Google Sign-In — `DEVELOPER_ERROR` / API Exception 10

Android のほぼすべてが **OAuth クライアントとアプリ署名の不一致**です。

### チェックリスト

| 項目 | 期待値 |
|---|---|
| `applicationId` / Android package | `com.taiki.spotto` |
| iOS `bundleIdentifier` | `com.taiki.spotto` |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | `google-services.json` の **client_type = 3（Web）** と同一 |
| Firebase Android アプリの SHA-1 | **debug** と **EAS/Play 署名**の両方 |
| Firebase Auth | Sign-in method → Google が有効 |

ローカル確認:

```bash
npm run check:firebase
```

debug 署名の SHA-1:

```bash
keytool -list -v \
  -keystore ~/.android/debug.keystore \
  -alias androiddebugkey \
  -storepass android -keypass android
```

EAS / 本番署名:

```bash
eas credentials -p android
```

表示された SHA-1 を **Firebase Console → プロジェクト設定 → マイアプリ（Android）→ SHA 証明書フィンガープリント** に追加し、`google-services.json` を再ダウンロードしてプロジェクトルートへ置き直す。その後 Dev Client / EAS を再ビルド。

### よくある誤り

- Web ではなく Android クライアント ID を `webClientId` に入れている
- debug だけ登録して EAS preview / production で失敗している
- Play App Signing の証明書を Firebase に未登録のまま Store ビルドしている
- package / Bundle ID がビルドと違う（Android / iOS とも `com.taiki.spotto`）

アプリ側は `@react-native-google-signin/google-signin` の `GoogleSignin.configure({ webClientId })` → Firebase `signInWithCredential`（`lib/firebaseGoogleAuth.ts`）。

---

## 2. LINE Sign-In — `404 Not Found` on `/auth/line-firebase`

アプリは `EXPO_PUBLIC_API_BASE_URL_REMOTE`（既定: `https://spotto-api-rupy.onrender.com`）へ

`POST /auth/line-firebase`

を送ります（`lib/firebaseLineAuth.ts`）。

### 本番が古い／別サービスのとき

現状、誤ったデプロイだと次のようになります。

```bash
curl -sS https://spotto-api-rupy.onrender.com/health
# 誤り: {"status":"ok"} だけ（service フィールドなし）

curl -sS -X GET https://spotto-api-rupy.onrender.com/auth/line-firebase
# 誤り: Nest 等の 404 JSON（POST も無い場合）
```

正しい `server/index.mjs` デプロイ後:

```bash
curl -sS https://spotto-api-rupy.onrender.com/health | jq .
# 期待: "service":"spotto-api"

curl -sS -X POST https://spotto-api-rupy.onrender.com/auth/line-firebase \
  -H 'Content-Type: application/json' -d '{}'
# 期待: accessToken (or code) is required（ルートはある）
```

### 修正手順

1. このリポジトリの `server/`（およびルートの `render.yaml`）を Render の **spotto-api** サービスにデプロイする  
   - Root Directory: `server`  
   - Start: `npm start`  
   - 詳細: [server/RENDER.md](../server/RENDER.md)
2. Render の環境変数に `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ID`（または `EXPO_PUBLIC_LINE_CHANNEL_ID`）と `FIREBASE_SERVICE_ACCOUNT_JSON` を設定
3. 上記 curl で `service: "spotto-api"` を確認
4. アプリの `.env` / EAS:
   - `EXPO_PUBLIC_API_BASE_URL_REMOTE=https://spotto-api-rupy.onrender.com`
   - （任意）`EXPO_PUBLIC_AUTH_API_URL` も同じ URL

ローカル API で試す場合:

```bash
cd server && npm start
# アプリは LAN の API または REMOTE を使う（実機では localhost 不可）
```

アプリは起動時に `/health` の `service === "spotto-api"` を確認し、別サービスの 404 をスキップします。
