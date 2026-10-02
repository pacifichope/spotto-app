# spotto API — Render デプロイ

`server/index.mjs` を Render の Web Service として常時稼働させる手順です。

## 前提

- リポジトリが GitHub / GitLab に push 済み
- Render アカウント作成済み
- **常時稼働**には **Starter プラン以上**が必要（Free は約15分アイドルでスリープ）

## 方法 A: Blueprint（推奨）

1. [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**
2. このリポジトリを選択（ルートの `render.yaml` が検出される）
3. `sync: false` の環境変数を入力して Apply
4. デプロイ完了後、サービス URL（例: `https://spotto-api-rupy.onrender.com`）を控える

## 方法 B: 手動で Web Service

| 項目 | 値 |
|---|---|
| Runtime | Node |
| Root Directory | `server` |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Health Check Path | `/health` |
| Instance Type | **Starter**（常時稼働） |
| Region | Singapore（日本から近い） |

環境変数は下表を Dashboard → Environment に追加。

## 必須環境変数

| Key | 説明 |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase サービスアカウント JSON を**1行**にした文字列（`GOOGLE_APPLICATION_CREDENTIALS` のファイルパスは Render では使わない） |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role（サーバー専用） |
| `EXPO_PUBLIC_STRIPE_MODE` | `test` または `live` |
| `STRIPE_SECRET_KEY_TEST` / `_LIVE` | モードに対応する Secret Key |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST` / `_LIVE` | ヘルスチェック用（アプリ側と同値） |
| `LINE_CHANNEL_SECRET` | LINE Login チャネルシークレット |
| `LINE_CHANNEL_ID` または `EXPO_PUBLIC_LINE_CHANNEL_ID` | LINE チャネル ID |
| `RESEND_API_KEY` | お問い合わせメール用（使う場合） |

| `GOOGLE_TRANSLATE_API_KEY` | Cloud Translation API キー（イベント作成時の日英自動翻訳。未設定時は `/events/translate` が 503） |

任意: `ADMIN_USER_IDS`, `CRON_SECRET`, `CORS_ORIGIN`, `PAYOUT_NOTIFY_*`

### Firebase JSON の入れ方

ローカルの `server/secrets/firebase-adminsdk.json` を1行にして環境変数へ:

```bash
node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('server/secrets/firebase-adminsdk.json','utf8'))))"
```

出力を `FIREBASE_SERVICE_ACCOUNT_JSON` の値にそのまま貼る。

## デプロイ確認

**重要:** 別リポジトリ／古いイメージが同じホスト名に載っていると、`/health` が `{"status":"ok"}` のみで、`POST /auth/line-firebase` が **404** になります（LINE ログイン失敗の典型原因）。

```bash
curl -sS https://<YOUR-SERVICE>.onrender.com/health | jq .
```

期待する応答（抜粋）:

```json
{
  "ok": true,
  "status": "ok",
  "service": "spotto-api",
  "auth": {
    "lineFirebase": "POST /auth/line-firebase",
    "firebaseAdmin": true
  }
}
```

認証ルートの存在確認:

```bash
curl -sS https://<YOUR-SERVICE>.onrender.com/auth/line-firebase | jq .
# → methods: ["POST"], service: "spotto-api"
```

`service` が無い、または Nest 風の 404 が出る場合は **このリポジトリの `server/` を再デプロイ**してください（Blueprint または Root Directory=`server`）。

詳細: [docs/AUTH_TROUBLESHOOTING.md](../docs/AUTH_TROUBLESHOOTING.md)

## アプリ側の設定

`.env`（および EAS の環境変数）を更新:

```bash
EXPO_PUBLIC_API_BASE_URL_REMOTE=https://<YOUR-SERVICE>.onrender.com
# 互換: EXPO_PUBLIC_API_BASE_URL も同じ HTTPS で可
```

変更後は Expo を再起動。本番ビルドなら EAS の env も同様に更新して再ビルド。

## 注意

- `server/data/bookings.json` はインスタンスのローカルディスク上にあり、**再デプロイで消える**可能性があります。本格運用の予約データは Supabase 側を正としてください。
- Free プランにするとスリープからのコールドスタートで数十秒かかることがあります。審査・実機検証では Starter 推奨です。
- Stripe の Test / Live は `EXPO_PUBLIC_STRIPE_MODE` とキーのペアを揃えてください。
- LINE: `LINE_CHANNEL_SECRET` と Firebase Admin（`FIREBASE_SERVICE_ACCOUNT_JSON`）が無いと `/auth/line-firebase` は 503 になります。
