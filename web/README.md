# spotto.fun

モバイルアプリとは別の、一覧と Web 予約用の Next.js です。データは既存の Supabase、決済は既存の `server/index.mjs` を使います。

## 起動

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

`.env.local` にはアプリと同じ Supabase の URL と anon キー、Firebase のウェブアプリ設定、公開中の API ベース URL を入れます。`service_role` と Stripe の秘密キーは置きません。

## 連携の順番

1. Firebase Console のウェブアプリを作り、承認済みドメインに `spotto.fun` とローカルの開発オリジンを追加する。Google / Apple プロバイダはアプリと同じプロジェクトを使う。
2. Supabase は新しいプロジェクトを作らない。`events` の SELECT が `anon` に開いていることを確認する（`supabase/apply_events.sql` の `events_select_all`）。
3. 予約の直前に `POST /auth/firebase-ensure-claims` を呼び、ID トークンへ `role=authenticated` を付けてから `event_participants` へ upsert する。`user_id` は Firebase の UID にする。
4. 有料のときは `POST /payments` に `preferHostedCheckout: true` を送り、返った `checkoutUrl` へ遷移する。戻ってきた `session_id` は `POST /payments/confirm` で確認してから参加登録する。
5. `APPLE_TEAM_ID` と Android の SHA-256 を入れてこのサイトを `spotto.fun` に公開する。iOS / Android は既存の Associated Domains と App Links が `/event` をアプリで開く。未インストールのときだけこのサイトのページが表示される。

LINE は、LINE Login のコールバックで受け取った `code` を既存の `POST /auth/line-firebase` に渡す。レスポンスの `customToken` で Firebase に入る。
