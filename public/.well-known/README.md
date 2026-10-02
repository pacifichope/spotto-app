# Universal Links / Android App Links（spotto.fun）

アプリ側の設定は `app.config.js` に済みです。**Web サーバー側**に以下を HTTPS で公開してください。

## 配置先

| ファイル | URL |
|---|---|
| `public/.well-known/apple-app-site-association` | `https://spotto.fun/.well-known/apple-app-site-association` |
| `public/.well-known/assetlinks.json` | `https://spotto.fun/.well-known/assetlinks.json` |

- AASA は **拡張子なし**・`Content-Type: application/json`（または `application/pkcs7-mime`）
- `assetlinks.json` も `application/json`
- `www.spotto.fun` を使う場合は同じファイルをそちらにも置く

## 置換が必要な値

1. **Apple Team ID**  
   `apple-app-site-association` 内の `APPLE_TEAM_ID` を Apple Developer の Team ID に置換  
   （例: `AB12CD34EF.com.taiki.spotto`）

2. **Android SHA-256**  
   `assetlinks.json` の指紋を置換  
   - EAS: `eas credentials -p android` → SHA256 Fingerprint  
   - Play Console: リリース → アプリの署名 → SHA-256 証明書フィンガープリント  
   形式例: `14:6D:E9:83:...`（コロン区切り）

## アプリ側ディープリンク

| 種別 | 例 |
|---|---|
| カスタムスキーム | `spotto://event/{id}` |
| Universal / App Link | `https://spotto.fun/event/{id}` |

Expo の `scheme` は **`spotto` のみ**（Google / LINE 用スキームは Info.plist / intent-filter のみ）。

## 検証

```bash
# カスタムスキーム
npx uri-scheme open "spotto://event/demo-id" --android
npx uri-scheme open "spotto://event/demo-id" --ios

# App Links（実機・検証済みドメイン）
adb shell am start -a android.intent.action.VIEW \
  -c android.intent.category.BROWSABLE \
  -d "https://spotto.fun/event/demo-id" com.taiki.spotto
```

設定変更後は **ネイティブ再ビルド**（`eas build` / `npx expo prebuild`）が必要です。
