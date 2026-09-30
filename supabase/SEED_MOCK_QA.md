# QA モックデータ（クラブ / イベント）

最終動作確認用のテストデータを `supabase/seed_mock_qa.sql` にまとめています。

## アプリに出ないとき

1. **RLS（読み取り）**  
   SQL Editor で `supabase/apply_events_select_public.sql` を実行し、`events` の SELECT が `anon` / `authenticated` に開いているか確認。

2. **アプリ側フィルタ（修正済み）**  
   ホームは「現在地の近く」半径外のイベントを隠します。`[QA]` / `mock_qa_*` はエリア・過去判定をバイパスするよう修正済みです。  
   クラブ一覧も、参加済みに加え QA モック主催クラブを表示します。

3. **取得確認**  
   開発ビルドのログに `[events] fetchRemoteEvents ok { qaMock: N, ... }` が出るか確認。`qaMock: 0` なら DB 未投入か RLS 拒否です。

4. **再投入**  
   `supabase/seed_mock_qa.sql` を再実行。

## 投入方法

### A. Supabase SQL Editor（いちばん簡単）

1. [Supabase Dashboard](https://supabase.com/dashboard) → 対象プロジェクト → **SQL Editor**
2. `supabase/seed_mock_qa.sql` の内容をすべて貼り付け
3. **Run**

再実行しても安全です（`mock_qa_*` / `[QA]` / 固定 UUID を先に削除してから入れ直します）。

### B. スクリプト + psql

```bash
# .env に SUPABASE_DB_URL（または DATABASE_URL）を設定
SUPABASE_DB_URL='postgresql://postgres:...@db.<project-ref>.supabase.co:5432/postgres' \
  node scripts/seed-mock-qa.mjs
```

## 作成される内容

| 種別 | ID / 目印 | 内容 |
|------|-----------|------|
| クラブ | `mock_qa_host_futsal` | アクティブ大型（フットサル・イベント複数・bio あり） |
| クラブ | `mock_qa_host_run_new` | 新規少人数（ランニング・無料イベント） |
| クラブ | `mock_qa_host_outdoor` | 画像・bio・SNS 充実（アウトドア） |
| イベント① | `[QA] 開催間近！…` | 約3時間後・参加者数名 |
| イベント② | `[QA] 定員間近…` | capacity 10 / joined 9（残り1）・¥1500 |
| イベント② | `[QA] 満員…` | capacity=joined・キャンセル待ちあり |
| イベント③ | `[QA] 無料…` | `price_yen = 0` |
| イベント③④ | `[QA] 有料＆複数チケット…` | ¥1500・`ticket_quantity=3` の参加者 |
| 複数日程 | `[QA] 平日夜バスケ練習` ×8 | 同一 `series_id`・2日おき・日付ごとに別ID・別参加者 |
| チャット | 開催間近 / 複数チケット | グループメッセージ数通 |

※ このアプリに独立した `clubs` テーブルはなく、**同一 `host_id` のイベント群＝クラブ**として表示されます。

## アプリでの確認手順

1. アプリを再起動（またはイベント一覧をプルリフレッシュ）
2. ホームでタイトル先頭 `[QA]` を探す
3. 各イベント詳細で定員・料金・参加者アバター／枚数バッジを確認
4. 主催者名タップ → クラブ詳細で cover・bio・メンバー・活動一覧
5. 開催間近イベントのグループチャット履歴

## 削除だけしたい場合

SQL Editor で次を実行:

```sql
delete from public.chat_thread_reads
where thread_id like 'a0000001-0000-4000-8000-%' or user_id like 'mock_qa_%';
delete from public.chat_thread_hides
where thread_id like 'a0000001-0000-4000-8000-%' or user_id like 'mock_qa_%';
delete from public.chat_messages where sender_id like 'mock_qa_%'
  or event_id::text like 'a0000001-0000-4000-8000-%';
delete from public.event_participants where user_id like 'mock_qa_%'
  or event_id::text like 'a0000001-0000-4000-8000-%';
delete from public.events where host_id like 'mock_qa_%' or title like '[QA]%';
delete from public.profiles where id like 'mock_qa_%';
```

または `supabase/delete_mock_qa.sql` を全文実行（推奨）。
