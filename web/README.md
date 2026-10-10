# app.spotto.fun

モバイルアプリとは別の、一覧と Web 予約用の Next.js です（本番ドメイン: `https://app.spotto.fun`）。データは既存の Supabase、決済は既存の `server/index.mjs` を使います。

## 起動

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

`.env.local` にはアプリと同じ Supabase の URL と anon キー、Firebase のウェブアプリ設定、公開中の API ベース URL を入れます。`service_role` と Stripe の秘密キーは置きません。

## 連携の順番

1. Firebase Console のウェブアプリを作り、**Authentication → Settings → Authorized domains** に次を追加する（ホスト名のみ。`https://` やパスは付けない）:
   - `localhost`
   - `app.spotto.fun`（本番カスタムドメイン）
   - 予備の Vercel ドメイン（例: `*.vercel.app`）がある場合はそれも
   Google / Apple プロバイダはアプリと同じプロジェクトを使う。Apple は Services ID の Return URL に `https://<project>.firebaseapp.com/__/auth/handler` も必要。
2. Supabase は新しいプロジェクトを作らない。`events` の SELECT が `anon` に開いていることを確認する（`supabase/apply_events.sql` の `events_select_all`）。
3. 予約の直前に `POST /auth/firebase-ensure-claims` を呼び、ID トークンへ `role=authenticated` を付けてから `event_participants` へ upsert する。`user_id` は Firebase の UID にする。
4. 有料のときは `POST /payments` に `preferHostedCheckout: true` を送り、返った `checkoutUrl` へ遷移する。戻ってきた `session_id` は `POST /payments/confirm` で確認してから参加登録する。
5. `APPLE_TEAM_ID` と Android の SHA-256 を入れてこのサイトを公開する。iOS / Android は Associated Domains / App Links が `app.spotto.fun` の `/event` をアプリで開く。未インストールのときだけこのサイトのページが表示される。
6. Vercel の環境変数 `NEXT_PUBLIC_SITE_URL=https://app.spotto.fun` を設定する（未設定時のコード側デフォルトも同値）。

### LINE Login（Web）

Supabase Auth の Callback（`https://xxx.supabase.co/auth/v1/callback`）は **使いません**。  
フローは `LINE Login → /auth/line/callback → POST /auth/line-firebase → Firebase Custom Token` です。

LINE Developers → LINE Login チャネル → Callback URL に、実際にサイトを開くオリジンで次を登録してください（一字一句一致）:

- `https://app.spotto.fun/auth/line/callback`
- `http://localhost:3456/auth/line/callback`（`npm run dev` のポートに合わせる）

`127.0.0.1` や LAN IP（`192.168.*`）で開くと Firebase / LINE の登録とずれやすいので、ローカルは `http://localhost:…` を使ってください。
