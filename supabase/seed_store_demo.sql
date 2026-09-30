-- =============================================================================
-- ストア / 審査スクショ用デモモック（本番見えの魅力的なイベント）
-- =============================================================================
-- 使い方:
--   1) Supabase Dashboard → SQL Editor でこのファイル全文を実行
--   2) npm run seed:store
--   3) psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed_store_demo.sql
--
-- 特徴:
--   - [QA] などテストっぽい接頭辞なし
--   - 東京・北海道・大阪など複数エリア
--   - 各スポーツはアプリのプリセット画像（SPORT_IMAGE_PRESETS）と整合
--   - 野球は打撃シーンの正しい画像を使用
--   - 開催日は常に「翌月11日以降」（最低 2026-10-11）— 審査員が参加しやすい未来日
--   - 再実行安全（mock_store_* / b0000001-… のみ差し替え）
-- =============================================================================

begin;

delete from public.chat_messages
where event_id::text like 'b0000001-0000-4000-8000-%'
   or sender_id like 'mock_store_%';

delete from public.event_participants
where event_id::text like 'b0000001-0000-4000-8000-%'
   or user_id like 'mock_store_%';

delete from public.events
where id::text like 'b0000001-0000-4000-8000-%'
   or host_id like 'mock_store_%';

delete from public.profiles where id like 'mock_store_%';

insert into public.profiles (id, display_name, nickname, gender, avatar_url, updated_at)
values
  ('mock_store_host_futsal', '渋谷エンジョイFC', '渋谷エンジョイFC', '男性', 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=400&q=80', now()),
  ('mock_store_host_run', '青山ランニング部', '青山ラン', '女性', 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=400&q=80', now()),
  ('mock_store_host_bball', '渋谷バスケラボ', 'バスケラボ', '男性', 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=400&q=80', now()),
  ('mock_store_host_badminton', 'バドエンジョイFC', 'バドエンジョイFC', '男性', 'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-badminton-court.jpg', now()),
  ('mock_store_host_baseball', '多摩川ベースボール会', '多摩川BB', '男性', 'https://images.unsplash.com/photo-1529768167801-9173d94c2a42?auto=format&fit=crop&w=400&q=80', now()),
  ('mock_store_host_sapporo', '札幌モーニングスポーツ', '札幌モーニング', '男性', 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=400&q=80', now()),
  ('mock_store_host_osaka', '中之島ゆるスポ部', '中之島ゆるスポ', '女性', 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?auto=format&fit=crop&w=400&q=80', now()),
  ('mock_store_host_shinjuku', '新宿スポーツ会', '新宿スポ', '男性', 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=400&q=80', now()),
  ('mock_store_host_meguro', '目黒エンジョイクラブ', '目黒エンジョイ', '女性', 'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?auto=format&fit=crop&w=400&q=80', now()),
  ('mock_store_u01', '佐藤みお', 'みお', '女性', 'https://i.pravatar.cc/200?u=mock_store_u01', now()),
  ('mock_store_u02', '田中けん', 'けん', '男性', 'https://i.pravatar.cc/200?u=mock_store_u02', now()),
  ('mock_store_u03', '鈴木ゆい', 'ゆい', '女性', 'https://i.pravatar.cc/200?u=mock_store_u03', now()),
  ('mock_store_u04', '高橋りく', 'りく', '男性', 'https://i.pravatar.cc/200?u=mock_store_u04', now()),
  ('mock_store_u05', '伊藤あや', 'あや', '女性', 'https://i.pravatar.cc/200?u=mock_store_u05', now()),
  ('mock_store_u06', '渡辺そうた', 'そうた', '男性', 'https://i.pravatar.cc/200?u=mock_store_u06', now()),
  ('mock_store_u07', '山本なな', 'なな', '女性', 'https://i.pravatar.cc/200?u=mock_store_u07', now()),
  ('mock_store_u08', '中村だいき', 'だいき', '男性', 'https://i.pravatar.cc/200?u=mock_store_u08', now()),
  ('mock_store_u09', '小林めい', 'めい', '女性', 'https://i.pravatar.cc/200?u=mock_store_u09', now()),
  ('mock_store_u10', '加藤ひろ', 'ひろ', '男性', 'https://i.pravatar.cc/200?u=mock_store_u10', now()),
  ('mock_store_u11', '斎藤はるか', 'はるか', '女性', 'https://i.pravatar.cc/200?u=mock_store_u11', now()),
  ('mock_store_u12', '松本ゆうき', 'ゆうき', '男性', 'https://i.pravatar.cc/200?u=mock_store_u12', now())
on conflict (id) do update set
  display_name = excluded.display_name,
  nickname = excluded.nickname,
  gender = excluded.gender,
  avatar_url = excluded.avatar_url,
  updated_at = excluded.updated_at;

-- ---------------------------------------------------------------------------
-- 2) イベント（日時は Asia/Tokyo・「翌月以降」固定）
--    審査員が参加テストしやすいよう、直近（明日など）ではなく
--    常に翌月11日以降（最低でも 2026-10-11）に分散配置する
-- ---------------------------------------------------------------------------
with
  t as (
    select timezone('Asia/Tokyo', now())::date as today_jst
  ),
  day0 as (
    select greatest(
      (
        date_trunc('month', t.today_jst::timestamp) + interval '1 month'
      )::date + 10,
      date '2026-10-11'
    ) as d
    from t
  ),
  sat as (
    select
      (d.d + ((6 - extract(dow from d.d)::int + 7) % 7))::date + time '10:00' as start_at,
      (d.d + ((6 - extract(dow from d.d)::int + 7) % 7))::date + time '12:00' as end_at
    from day0 d
  ),
  sun as (
    select
      (d.d + ((7 - extract(dow from d.d)::int + 7) % 7))::date + time '09:00' as start_at,
      (d.d + ((7 - extract(dow from d.d)::int + 7) % 7))::date + time '10:30' as end_at
    from day0 d
  ),
  fri as (
    select
      (d.d + ((5 - extract(dow from d.d)::int + 7) % 7))::date + time '19:00' as start_at,
      (d.d + ((5 - extract(dow from d.d)::int + 7) % 7))::date + time '21:00' as end_at
    from day0 d
  ),
  night as (
    select
      ((select start_at::date from sat) + 2) + time '19:00' as start_at,
      ((select start_at::date from sat) + 2) + time '21:00' as end_at
  ),
  morning as (
    select
      ((select start_at::date from sat) + 3) + time '07:30' as start_at,
      ((select start_at::date from sat) + 3) + time '09:00' as end_at
  ),
  eve as (
    select
      ((select start_at::date from sat) + 4) + time '18:30' as start_at,
      ((select start_at::date from sat) + 4) + time '20:30' as end_at
  ),
  next_sat as (
    select
      ((select start_at::date from sat) + 7) + time '14:00' as start_at,
      ((select start_at::date from sat) + 7) + time '16:00' as end_at
  )
insert into public.events (
  id, host_id, title, sport, emoji, location, location_note,
  event_date, event_time, end_date, end_time, schedule_type, level,
  target_age_groups, latitude, longitude, capacity, joined_count,
  host_name, host_image_uri, host_bio, host_sns_links, vibe, description,
  image_uri, image_uris, accent, registration_deadline_offset,
  waitlist_enabled, waitlist_count, enable_pre_questions,
  items_to_bring, included_items, price_yen, cancel_policy, created_at, updated_at
)
values
(
  'b0000001-0000-4000-8000-000000000001',
  'mock_store_host_futsal',
  '初心者大歓迎！週末エンジョイフットサル交流会',
  'フットサル', '⚽',
  '東京都渋谷区神南1丁目 代々木公園フットサルコート',
  'コート入口のベンチ前に集合（開始10分前）',
  to_char((select start_at from sat), 'YYYY-MM-DD'),
  to_char((select start_at from sat), 'HH24:MI'),
  to_char((select end_at from sat), 'YYYY-MM-DD'),
  to_char((select end_at from sat), 'HH24:MI'),
  'single', '誰でも歓迎', array['20代','30代'],
  35.6712, 139.6949, 16, 0,
  '渋谷エンジョイFC',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=400&q=80',
  '渋谷・原宿エリアで楽しくフットサル。勝ち負けより笑顔優先。初めての方も大歓迎です。',
  '[{"id":"store-ig","kind":"instagram","url":"https://instagram.com/"}]'::jsonb,
  '初心者OK・週末朝から汗を流そう',
  E'ルール説明から丁寧にサポートします。\n\n・開始10分前集合でウォームアップ\n・レベル分けせずミックスで回せます\n・終了後は近くのカフェで軽く交流もOK\n\n運動不足解消や新しい仲間づくりにぴったりです。',
  'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-futsal-1.jpg',
  array[
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-futsal-1.jpg',
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-futsal-2.jpg',
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-futsal-3.jpg'
  ],
  '#0EA5E9', '0', false, 0, false,
  array['インドアシューズ','着替え','飲み物'],
  array['ビブス','ボール','救急セット'],
  1000, '開催24時間前まで全額返金', now(), now()
),
(
  'b0000001-0000-4000-8000-000000000003',
  'mock_store_host_bball',
  '【金曜夜】仕事終わりに軽く汗を流そう！バスケ初心者の会',
  'バスケットボール', '🏀',
  '東京都渋谷区宇田川町 渋谷区スポーツセンター',
  '1F受付で「バスケラボ」とお伝えください',
  to_char((select start_at from fri), 'YYYY-MM-DD'),
  to_char((select start_at from fri), 'HH24:MI'),
  to_char((select end_at from fri), 'YYYY-MM-DD'),
  to_char((select end_at from fri), 'HH24:MI'),
  'single', '初心者', array['20代','30代'],
  35.6619, 139.6983, 12, 0,
  '渋谷バスケラボ',
  'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=400&q=80',
  '平日夜の半コートゲーム中心。教え合いの雰囲気で初心者も安心です。',
  '[]'::jsonb,
  '金曜夜・短時間でしっかり動ける',
  E'ハーフコート3on3をローテーション。\nシューズ・ウェアは各自ご持参を。\n経験がなくてもフォームから一緒に練習できます。',
  'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1519861531473-9200262188bf?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1200&q=80'
  ],
  '#F59E0B', '0', false, 0, false,
  array['バスケシューズ','タオル','飲み物'],
  array['ボール','ビブス'],
  1200, '開催12時間前まで全額返金', now(), now()
),
(
  'b0000001-0000-4000-8000-000000000004',
  'mock_store_host_run',
  '青山ゆる朝ラン〜外苑〜明治神宮コース',
  'ランニング', '🏃',
  '東京都港区北青山2丁目 青山一丁目駅 出口付近',
  '駅改札を出てすぐのローソン前',
  to_char((select start_at from morning), 'YYYY-MM-DD'),
  to_char((select start_at from morning), 'HH24:MI'),
  to_char((select end_at from morning), 'YYYY-MM-DD'),
  to_char((select end_at from morning), 'HH24:MI'),
  'single', '初心者', array['20代','30代','40代'],
  35.6724, 139.7242, 18, 0,
  '青山ランニング部',
  'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=400&q=80',
  '会話できるペース重視の朝ラン。距離は5〜8km、途中休憩あり。',
  '[]'::jsonb,
  '会話できるペース・朝の気分転換',
  E'キロ7分前後が目安です。遅れても大丈夫なように折り返しポイントを設けます。\n終了後は任意で近くのカフェへ。',
  'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-running-sakura.jpg',
  array[
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-running-sakura.jpg',
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-running-feet.jpg',
    'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1200&q=80'
  ],
  '#06B6D4', '0', false, 0, false,
  array['ランニングシューズ','飲み物'],
  array[]::text[],
  0, null, now(), now()
),
(
  'b0000001-0000-4000-8000-000000000005',
  'mock_store_host_futsal',
  '恵比寿インドアテニス体験＆交流ゲーム',
  'テニス', '🎾',
  '東京都渋谷区恵比寿南1丁目 恵比寿ガーデンプレイス付近インドア',
  '受付で「エンジョイテニス」とお伝えください',
  to_char((select start_at from eve), 'YYYY-MM-DD'),
  to_char((select start_at from eve), 'HH24:MI'),
  to_char((select end_at from eve), 'YYYY-MM-DD'),
  to_char((select end_at from eve), 'HH24:MI'),
  'single', '初心者', array['20代','30代'],
  35.6467, 139.7101, 8, 0,
  '渋谷エンジョイFC',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=400&q=80',
  '渋谷・原宿エリアで楽しくスポーツ。テニス初級クラスも不定期開催。',
  '[]'::jsonb,
  'ラケット貸出あり・気軽にラリー',
  E'ストローク中心のドリルのあと、ゲーム形式で交流します。\nラケットをお持ちでない方は無料貸出あり（数に限りあり）。',
  'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=1200&q=80'
  ],
  '#84CC16', '0', false, 0, false,
  array['動きやすい服','室内シューズ'],
  array['ボール','ラケット貸出'],
  2500, '開催24時間前まで全額返金', now(), now()
),
(
  'b0000001-0000-4000-8000-000000000006',
  'mock_store_host_bball',
  'お台場で楽しむインドアバレー交流会',
  'バレーボール', '🏐',
  '東京都江東区青海1丁目 お台場エリアスポーツ施設',
  'シンボルプロムナード公園側入口',
  to_char((select start_at from next_sat), 'YYYY-MM-DD'),
  to_char((select start_at from next_sat), 'HH24:MI'),
  to_char((select end_at from next_sat), 'YYYY-MM-DD'),
  to_char((select end_at from next_sat), 'HH24:MI'),
  'single', '誰でも歓迎', array['20代','30代'],
  35.6256, 139.7765, 14, 0,
  '渋谷バスケラボ',
  'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=400&q=80',
  'バスケ以外にもインドア交流を企画。ワイワイ優先です。',
  '[]'::jsonb,
  'ルールゆるめ・写真映えスポット近く',
  E'6人制ベースですが、人数に合わせて柔軟に調整します。\nサーブ・レシーブの基礎から一緒にやりましょう。',
  'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1547347298-4074fc3086f0?auto=format&fit=crop&w=1200&q=80'
  ],
  '#8B5CF6', '0', false, 0, false,
  array['室内シューズ','タオル'],
  array['ボール'],
  1000, '開催24時間前まで全額返金', now(), now()
),
(
  'b0000001-0000-4000-8000-000000000007',
  'mock_store_host_badminton',
  '【残りわずか】五反田ナイトバドミントン',
  'バドミントン', '🏸',
  '東京都品川区西五反田1丁目 区民体育館',
  '2Fアリーナ入口',
  to_char((select start_at from night), 'YYYY-MM-DD'),
  to_char((select start_at from night), 'HH24:MI'),
  to_char((select end_at from night), 'YYYY-MM-DD'),
  to_char((select end_at from night), 'HH24:MI'),
  'single', '中級', array['20代','30代','40代'],
  35.6259, 139.7238, 10, 0,
  'バドエンジョイFC',
  'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-badminton-court.jpg',
  '五反田で週1ナイトバドミントン。ダブルス中心・楽しくラリー優先です。',
  '[]'::jsonb,
  'シャトル打ち放題・ゲーム多め',
  E'ダブルス中心。経験者同士でも初心者同士でも楽しめます。\nラケット持参推奨（数本貸出あり）。',
  'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-badminton-court.jpg',
  array[
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-badminton-court.jpg',
    'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?auto=format&fit=crop&w=1200&q=80'
  ],
  '#EC4899', '0', false, 0, false,
  array['室内シューズ','ラケット（あれば）'],
  array['シャトル'],
  1000, '開催24時間前まで全額返金', now(), now()
),
(
  'b0000001-0000-4000-8000-000000000008',
  'mock_store_host_baseball',
  '多摩川河川敷でキャッチボール＆ティー打撃',
  '野球', '⚾',
  '東京都大田区多摩川 多摩川河川敷グラウンド付近',
  'ガス橋寄りの駐車場前に集合',
  to_char((select start_at from sat), 'YYYY-MM-DD'),
  '15:00',
  to_char((select start_at from sat), 'YYYY-MM-DD'),
  '17:00',
  'single', '誰でも歓迎', array['20代','30代','40代'],
  35.5875, 139.6688, 12, 0,
  '多摩川ベースボール会',
  'https://images.unsplash.com/photo-1529768167801-9173d94c2a42?auto=format&fit=crop&w=400&q=80',
  '週末の河川敷で気軽にボール遊び。グローブ初心者も大歓迎です。',
  '[]'::jsonb,
  'グローブ持参・道具シェア歓迎',
  E'キャッチボール中心＋ティー打撃を少し。\n\n・グローブをお持ちでない方はお声がけください（数個あります）\n・バット・ティー・ボールは主催側で用意\n・終了後は任意で軽く交流タイム\n\n久しぶりの野球にぴったりのペースです。',
  'https://images.unsplash.com/photo-1529768167801-9173d94c2a42?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1529768167801-9173d94c2a42?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1508344928928-7165b67de128?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1659132252130-5dc2962bc425?auto=format&fit=crop&w=1200&q=80'
  ],
  '#F97316', '0', false, 0, false,
  array['グローブ','動きやすい服'],
  array['バット','ティー','ボール'],
  500, '開催の前日まで全額返金', now(), now()
),
(
  'b0000001-0000-4000-8000-000000000009',
  'mock_store_host_sapporo',
  '札幌大通公園 朝ラン＆カフェ立ち寄り会',
  'ランニング', '🏃',
  '北海道札幌市中央区大通西4 大通公園 テレビ塔付近',
  'テレビ塔正面のベンチ前',
  to_char((select start_at from sun), 'YYYY-MM-DD'),
  '08:00',
  to_char((select start_at from sun), 'YYYY-MM-DD'),
  '09:30',
  'single', '誰でも歓迎', array['20代','30代','40代'],
  43.0610, 141.3544, 16, 0,
  '札幌モーニングスポーツ',
  'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=400&q=80',
  '札幌の朝をスポーツで気持ちよく。季節のコースを案内します。',
  '[]'::jsonb,
  '北海道の朝・景色を楽しみながら',
  E'大通〜中島公園あたりを約5km。ペースは遅めでOK。\n終了後は任意で近くのカフェへご案内します。',
  'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-running-sakura.jpg',
  array[
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-running-sakura.jpg',
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-running-feet.jpg',
    'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1200&q=80'
  ],
  '#0EA5E9', '0', false, 0, false,
  array['ランニングシューズ','防寒しやすい薄手の上着'],
  array[]::text[],
  0, null, now(), now()
),
(
  'b0000001-0000-4000-8000-00000000000a',
  'mock_store_host_sapporo',
  '円山で週末バスケ！オープンコート交流戦',
  'バスケットボール', '🏀',
  '北海道札幌市中央区南1条西24 円山周辺体育館',
  '正面玄関ロビー集合',
  to_char((select start_at from sat), 'YYYY-MM-DD'),
  '13:00',
  to_char((select start_at from sat), 'YYYY-MM-DD'),
  '15:00',
  'single', '中級', array['20代','30代'],
  43.0548, 141.3142, 14, 0,
  '札幌モーニングスポーツ',
  'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=400&q=80',
  '札幌の朝をスポーツで気持ちよく。バスケ企画も人気です。',
  '[]'::jsonb,
  'ハーフコート中心・勝ち負けより交流',
  E'経験者歓迎。初めての方もフォームを見ながらサポートします。',
  'https://images.unsplash.com/photo-1519861531473-9200262188bf?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1519861531473-9200262188bf?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80'
  ],
  '#F59E0B', '0', false, 0, false,
  array['バスケシューズ','タオル'],
  array['ボール','ビブス'],
  1000, '開催24時間前まで全額返金', now(), now()
),
(
  'b0000001-0000-4000-8000-00000000000b',
  'mock_store_host_osaka',
  '中之島ゆるジョグ＆ストレッチ交流会',
  'ランニング', '🏃',
  '大阪府大阪市北区中之島1丁目 中之島公園',
  'バラ園近くの噴水前',
  to_char((select start_at from sun), 'YYYY-MM-DD'),
  '09:30',
  to_char((select start_at from sun), 'YYYY-MM-DD'),
  '11:00',
  'single', '初心者', array['20代','30代','40代'],
  34.6935, 135.5018, 15, 0,
  '中之島ゆるスポ部',
  'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?auto=format&fit=crop&w=400&q=80',
  '大阪・中之島でゆるく体を動かす会。ラン初心者歓迎。',
  '[]'::jsonb,
  '川沿いの景色・おしゃべりOKペース',
  E'約4kmのゆるジョグ＋ストレッチ。\n走らなくても散歩ペースでの参加も歓迎です。',
  'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-running-sakura.jpg',
  array[
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-running-sakura.jpg',
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-running-feet.jpg',
    'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1200&q=80'
  ],
  '#14B8A6', '0', false, 0, false,
  array['動きやすい靴','飲み物'],
  array[]::text[],
  0, null, now(), now()
),
(
  'b0000001-0000-4000-8000-00000000000c',
  'mock_store_host_futsal',
  '銀座ナイトフットサルマッチ',
  'フットサル', '⚽',
  '東京都中央区銀座 近隣インドアフットサルコート',
  'ビル1Fエントランス集合',
  to_char((select start_at from eve), 'YYYY-MM-DD'),
  '20:00',
  to_char((select start_at from eve), 'YYYY-MM-DD'),
  '22:00',
  'single', '中級', array['20代','30代'],
  35.6717, 139.7650, 12, 0,
  '渋谷エンジョイFC',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=400&q=80',
  '渋谷・銀座エリアでナイトマッチも開催。仕事帰りにどうぞ。',
  '[]'::jsonb,
  '都心・仕事帰りにしっかり汗',
  E'ゲーム多めのナイトマッチ。レベル感は中級寄りですが、楽しさ優先です。',
  'https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1200&q=80'
  ],
  '#EF4444', '0', false, 0, false,
  array['インドアシューズ','着替え'],
  array['ビブス','ボール'],
  2000, '開催24時間前まで全額返金', now(), now()
),
(
  'b0000001-0000-4000-8000-00000000000d',
  'mock_store_host_shinjuku',
  '新宿御苑まわりゆる朝ラン',
  'ランニング', '🏃',
  '東京都新宿区内藤町 新宿御苑 大木戸門付近',
  '大木戸門前のベンチに集合（開始10分前）',
  to_char((select start_at from morning), 'YYYY-MM-DD'),
  to_char((select start_at from morning), 'HH24:MI'),
  to_char((select end_at from morning), 'YYYY-MM-DD'),
  to_char((select end_at from morning), 'HH24:MI'),
  'single', '初心者', array['20代','30代','40代'],
  35.6852, 139.7101, 16, 0,
  '新宿スポーツ会',
  'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=400&q=80',
  '新宿御苑周辺で会話できるペースの朝ラン。初めての方も歓迎です。',
  '[]'::jsonb,
  '御苑まわり・おしゃべりOKペース',
  E'約5kmのゆるジョグ。キロ7分前後が目安です。\n途中で水分休憩あり。終了後は任意で近くのカフェへ。',
  'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-running-sakura.jpg',
  array[
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-running-sakura.jpg',
    'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-running-feet.jpg',
    'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1200&q=80'
  ],
  '#14B8A6', '0', false, 0, false,
  array['ランニングシューズ','飲み物'],
  array[]::text[],
  0, null, now(), now()
),
(
  'b0000001-0000-4000-8000-00000000000e',
  'mock_store_host_shinjuku',
  '西新宿ナイトバスケ半コート',
  'バスケットボール', '🏀',
  '東京都新宿区西新宿 近隣スポーツセンター',
  '1F受付で「新宿スポ」とお伝えください',
  to_char((select start_at from night), 'YYYY-MM-DD'),
  to_char((select start_at from night), 'HH24:MI'),
  to_char((select end_at from night), 'YYYY-MM-DD'),
  to_char((select end_at from night), 'HH24:MI'),
  'single', '誰でも歓迎', array['20代','30代'],
  35.6896, 139.6925, 14, 0,
  '新宿スポーツ会',
  'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=400&q=80',
  '西新宿で仕事帰りに半コートゲーム。教え合いの雰囲気です。',
  '[]'::jsonb,
  '仕事帰り・半コートでしっかり動く',
  E'3on3をローテーション。経験不問、楽しさ優先です。\nシューズ・ウェアは各自ご持参ください。',
  'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1519861531473-9200262188bf?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1200&q=80'
  ],
  '#F59E0B', '0', false, 0, false,
  array['バスケシューズ','タオル','飲み物'],
  array['ボール','ビブス'],
  1200, '開催12時間前まで全額返金', now(), now()
),
(
  'b0000001-0000-4000-8000-00000000000f',
  'mock_store_host_meguro',
  '目黒ナイトバレー練習マッチ',
  'バレーボール', '🏐',
  '東京都目黒区目黒2丁目 目黒区民センター',
  '体育館Aコート入口に集合',
  to_char((select start_at from eve), 'YYYY-MM-DD'),
  to_char((select start_at from eve), 'HH24:MI'),
  to_char((select end_at from eve), 'YYYY-MM-DD'),
  to_char((select end_at from eve), 'HH24:MI'),
  'single', '中級', array['20代','30代'],
  35.6415, 139.6981, 12, 0,
  '目黒エンジョイクラブ',
  'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?auto=format&fit=crop&w=400&q=80',
  '目黒でナイトバレー。ウォームアップ後に練習マッチを回します。',
  '[]'::jsonb,
  '夜練・基礎からゲームまで',
  E'サーブ・レシーブのウォームアップ後、6人制の練習マッチ。\n高校・サークル経験があると安心ですが、基礎が分かれば大歓迎です。',
  'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1547347298-4074fc3086f0?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1592656094267-764a45160876?auto=format&fit=crop&w=1200&q=80'
  ],
  '#8B5CF6', '0', false, 0, false,
  array['インドアシューズ','タオル','飲み物'],
  array['ボール','ネット設営'],
  1300, '開催24時間前まで全額返金', now(), now()
),
(
  'b0000001-0000-4000-8000-000000000010',
  'mock_store_host_meguro',
  '中目黒テニスゆるシングルス練習',
  'テニス', '🎾',
  '東京都目黒区上目黒 中目黒公園テニスコート付近',
  '公園入口の案内板前に集合',
  to_char((select start_at from next_sat), 'YYYY-MM-DD'),
  to_char((select start_at from next_sat), 'HH24:MI'),
  to_char((select end_at from next_sat), 'YYYY-MM-DD'),
  to_char((select end_at from next_sat), 'HH24:MI'),
  'single', '初心者', array['20代','30代','40代'],
  35.6441, 139.6989, 8, 0,
  '目黒エンジョイクラブ',
  'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=400&q=80',
  '中目黒で気軽なシングルス練習。ラリー中心でフォームも相談できます。',
  '[]'::jsonb,
  'ゆるシングルス・ラリー多め',
  E'ラリーとポイント練習が中心です。ラケット持参推奨（貸出1本あり）。\n初心者・ブランクあり歓迎。',
  'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=1200&q=80'
  ],
  '#22C55E', '0', false, 0, false,
  array['テニスシューズ','ラケット（あれば）','飲み物'],
  array['ボール','ラケット貸出（数本）'],
  1500, '開催24時間前まで全額返金', now(), now()
);

-- ---------------------------------------------------------------------------
-- 3) 参加者（アバターが並ぶように人数を厚めに）
-- ---------------------------------------------------------------------------
insert into public.event_participants (
  event_id, user_id, status, ticket_quantity, display_name, avatar_url, created_at
) values
  ('b0000001-0000-4000-8000-000000000001', 'mock_store_host_futsal', 'joined', 1, '渋谷エンジョイFC', 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=400&q=80', now() - interval '4 days'),
  ('b0000001-0000-4000-8000-000000000001', 'mock_store_u01', 'joined', 1, '佐藤みお', 'https://i.pravatar.cc/200?u=mock_store_u01', now() - interval '3 days'),
  ('b0000001-0000-4000-8000-000000000001', 'mock_store_u02', 'joined', 1, '田中けん', 'https://i.pravatar.cc/200?u=mock_store_u02', now() - interval '3 days'),
  ('b0000001-0000-4000-8000-000000000001', 'mock_store_u03', 'joined', 1, '鈴木ゆい', 'https://i.pravatar.cc/200?u=mock_store_u03', now() - interval '2 days'),
  ('b0000001-0000-4000-8000-000000000001', 'mock_store_u04', 'joined', 1, '高橋りく', 'https://i.pravatar.cc/200?u=mock_store_u04', now() - interval '2 days'),
  ('b0000001-0000-4000-8000-000000000001', 'mock_store_u05', 'joined', 1, '伊藤あや', 'https://i.pravatar.cc/200?u=mock_store_u05', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-000000000001', 'mock_store_u06', 'joined', 2, '渡辺そうた', 'https://i.pravatar.cc/200?u=mock_store_u06', now() - interval '20 hours'),
  ('b0000001-0000-4000-8000-000000000001', 'mock_store_u07', 'joined', 1, '山本なな', 'https://i.pravatar.cc/200?u=mock_store_u07', now() - interval '12 hours'),
  ('b0000001-0000-4000-8000-000000000001', 'mock_store_u11', 'joined', 1, '斎藤はるか', 'https://i.pravatar.cc/200?u=mock_store_u11', now() - interval '6 hours'),
  ('b0000001-0000-4000-8000-000000000003', 'mock_store_host_bball', 'joined', 1, '渋谷バスケラボ', 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=400&q=80', now() - interval '3 days'),
  ('b0000001-0000-4000-8000-000000000003', 'mock_store_u02', 'joined', 1, '田中けん', 'https://i.pravatar.cc/200?u=mock_store_u02', now() - interval '2 days'),
  ('b0000001-0000-4000-8000-000000000003', 'mock_store_u04', 'joined', 1, '高橋りく', 'https://i.pravatar.cc/200?u=mock_store_u04', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-000000000003', 'mock_store_u06', 'joined', 1, '渡辺そうた', 'https://i.pravatar.cc/200?u=mock_store_u06', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-000000000003', 'mock_store_u08', 'joined', 1, '中村だいき', 'https://i.pravatar.cc/200?u=mock_store_u08', now() - interval '10 hours'),
  ('b0000001-0000-4000-8000-000000000003', 'mock_store_u10', 'joined', 1, '加藤ひろ', 'https://i.pravatar.cc/200?u=mock_store_u10', now() - interval '6 hours'),
  ('b0000001-0000-4000-8000-000000000003', 'mock_store_u12', 'joined', 1, '松本ゆうき', 'https://i.pravatar.cc/200?u=mock_store_u12', now() - interval '3 hours'),
  ('b0000001-0000-4000-8000-000000000004', 'mock_store_host_run', 'joined', 1, '青山ランニング部', 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=400&q=80', now() - interval '2 days'),
  ('b0000001-0000-4000-8000-000000000004', 'mock_store_u01', 'joined', 1, '佐藤みお', 'https://i.pravatar.cc/200?u=mock_store_u01', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-000000000004', 'mock_store_u05', 'joined', 1, '伊藤あや', 'https://i.pravatar.cc/200?u=mock_store_u05', now() - interval '20 hours'),
  ('b0000001-0000-4000-8000-000000000004', 'mock_store_u09', 'joined', 1, '小林めい', 'https://i.pravatar.cc/200?u=mock_store_u09', now() - interval '8 hours'),
  ('b0000001-0000-4000-8000-000000000004', 'mock_store_u11', 'joined', 1, '斎藤はるか', 'https://i.pravatar.cc/200?u=mock_store_u11', now() - interval '5 hours'),
  ('b0000001-0000-4000-8000-000000000005', 'mock_store_host_futsal', 'joined', 1, '渋谷エンジョイFC', 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=400&q=80', now() - interval '2 days'),
  ('b0000001-0000-4000-8000-000000000005', 'mock_store_u03', 'joined', 1, '鈴木ゆい', 'https://i.pravatar.cc/200?u=mock_store_u03', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-000000000005', 'mock_store_u07', 'joined', 1, '山本なな', 'https://i.pravatar.cc/200?u=mock_store_u07', now() - interval '12 hours'),
  ('b0000001-0000-4000-8000-000000000005', 'mock_store_u11', 'joined', 1, '斎藤はるか', 'https://i.pravatar.cc/200?u=mock_store_u11', now() - interval '4 hours'),
  ('b0000001-0000-4000-8000-000000000006', 'mock_store_host_bball', 'joined', 1, '渋谷バスケラボ', 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=400&q=80', now() - interval '3 days'),
  ('b0000001-0000-4000-8000-000000000006', 'mock_store_u02', 'joined', 1, '田中けん', 'https://i.pravatar.cc/200?u=mock_store_u02', now() - interval '2 days'),
  ('b0000001-0000-4000-8000-000000000006', 'mock_store_u04', 'joined', 1, '高橋りく', 'https://i.pravatar.cc/200?u=mock_store_u04', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-000000000006', 'mock_store_u08', 'joined', 1, '中村だいき', 'https://i.pravatar.cc/200?u=mock_store_u08', now() - interval '8 hours'),
  ('b0000001-0000-4000-8000-000000000006', 'mock_store_u12', 'joined', 1, '松本ゆうき', 'https://i.pravatar.cc/200?u=mock_store_u12', now() - interval '3 hours'),
  ('b0000001-0000-4000-8000-000000000007', 'mock_store_host_badminton', 'joined', 1, 'バドエンジョイFC', 'https://gcannfzalogpgxtowapq.supabase.co/storage/v1/object/public/event-images/contact/store-demo-badminton-court.jpg', now() - interval '4 days'),
  ('b0000001-0000-4000-8000-000000000007', 'mock_store_u01', 'joined', 1, '佐藤みお', 'https://i.pravatar.cc/200?u=mock_store_u01', now() - interval '3 days'),
  ('b0000001-0000-4000-8000-000000000007', 'mock_store_u02', 'joined', 1, '田中けん', 'https://i.pravatar.cc/200?u=mock_store_u02', now() - interval '3 days'),
  ('b0000001-0000-4000-8000-000000000007', 'mock_store_u03', 'joined', 1, '鈴木ゆい', 'https://i.pravatar.cc/200?u=mock_store_u03', now() - interval '2 days'),
  ('b0000001-0000-4000-8000-000000000007', 'mock_store_u05', 'joined', 1, '伊藤あや', 'https://i.pravatar.cc/200?u=mock_store_u05', now() - interval '2 days'),
  ('b0000001-0000-4000-8000-000000000007', 'mock_store_u06', 'joined', 1, '渡辺そうた', 'https://i.pravatar.cc/200?u=mock_store_u06', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-000000000007', 'mock_store_u07', 'joined', 1, '山本なな', 'https://i.pravatar.cc/200?u=mock_store_u07', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-000000000007', 'mock_store_u09', 'joined', 1, '小林めい', 'https://i.pravatar.cc/200?u=mock_store_u09', now() - interval '10 hours'),
  ('b0000001-0000-4000-8000-000000000007', 'mock_store_u10', 'joined', 1, '加藤ひろ', 'https://i.pravatar.cc/200?u=mock_store_u10', now() - interval '6 hours'),
  ('b0000001-0000-4000-8000-000000000008', 'mock_store_host_baseball', 'joined', 1, '多摩川ベースボール会', 'https://images.unsplash.com/photo-1529768167801-9173d94c2a42?auto=format&fit=crop&w=400&q=80', now() - interval '2 days'),
  ('b0000001-0000-4000-8000-000000000008', 'mock_store_u02', 'joined', 1, '田中けん', 'https://i.pravatar.cc/200?u=mock_store_u02', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-000000000008', 'mock_store_u04', 'joined', 1, '高橋りく', 'https://i.pravatar.cc/200?u=mock_store_u04', now() - interval '12 hours'),
  ('b0000001-0000-4000-8000-000000000008', 'mock_store_u08', 'joined', 1, '中村だいき', 'https://i.pravatar.cc/200?u=mock_store_u08', now() - interval '8 hours'),
  ('b0000001-0000-4000-8000-000000000008', 'mock_store_u12', 'joined', 1, '松本ゆうき', 'https://i.pravatar.cc/200?u=mock_store_u12', now() - interval '4 hours'),
  ('b0000001-0000-4000-8000-000000000009', 'mock_store_host_sapporo', 'joined', 1, '札幌モーニングスポーツ', 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=400&q=80', now() - interval '3 days'),
  ('b0000001-0000-4000-8000-000000000009', 'mock_store_u01', 'joined', 1, '佐藤みお', 'https://i.pravatar.cc/200?u=mock_store_u01', now() - interval '2 days'),
  ('b0000001-0000-4000-8000-000000000009', 'mock_store_u03', 'joined', 1, '鈴木ゆい', 'https://i.pravatar.cc/200?u=mock_store_u03', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-000000000009', 'mock_store_u05', 'joined', 1, '伊藤あや', 'https://i.pravatar.cc/200?u=mock_store_u05', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-000000000009', 'mock_store_u09', 'joined', 1, '小林めい', 'https://i.pravatar.cc/200?u=mock_store_u09', now() - interval '8 hours'),
  ('b0000001-0000-4000-8000-00000000000a', 'mock_store_host_sapporo', 'joined', 1, '札幌モーニングスポーツ', 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=400&q=80', now() - interval '2 days'),
  ('b0000001-0000-4000-8000-00000000000a', 'mock_store_u02', 'joined', 1, '田中けん', 'https://i.pravatar.cc/200?u=mock_store_u02', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-00000000000a', 'mock_store_u04', 'joined', 1, '高橋りく', 'https://i.pravatar.cc/200?u=mock_store_u04', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-00000000000a', 'mock_store_u06', 'joined', 1, '渡辺そうた', 'https://i.pravatar.cc/200?u=mock_store_u06', now() - interval '10 hours'),
  ('b0000001-0000-4000-8000-00000000000a', 'mock_store_u12', 'joined', 1, '松本ゆうき', 'https://i.pravatar.cc/200?u=mock_store_u12', now() - interval '5 hours'),
  ('b0000001-0000-4000-8000-00000000000b', 'mock_store_host_osaka', 'joined', 1, '中之島ゆるスポ部', 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?auto=format&fit=crop&w=400&q=80', now() - interval '2 days'),
  ('b0000001-0000-4000-8000-00000000000b', 'mock_store_u03', 'joined', 1, '鈴木ゆい', 'https://i.pravatar.cc/200?u=mock_store_u03', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-00000000000b', 'mock_store_u07', 'joined', 1, '山本なな', 'https://i.pravatar.cc/200?u=mock_store_u07', now() - interval '12 hours'),
  ('b0000001-0000-4000-8000-00000000000b', 'mock_store_u09', 'joined', 1, '小林めい', 'https://i.pravatar.cc/200?u=mock_store_u09', now() - interval '6 hours'),
  ('b0000001-0000-4000-8000-00000000000b', 'mock_store_u11', 'joined', 1, '斎藤はるか', 'https://i.pravatar.cc/200?u=mock_store_u11', now() - interval '3 hours'),
  ('b0000001-0000-4000-8000-00000000000c', 'mock_store_host_futsal', 'joined', 1, '渋谷エンジョイFC', 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=400&q=80', now() - interval '5 days'),
  ('b0000001-0000-4000-8000-00000000000c', 'mock_store_u01', 'joined', 1, '佐藤みお', 'https://i.pravatar.cc/200?u=mock_store_u01', now() - interval '4 days'),
  ('b0000001-0000-4000-8000-00000000000c', 'mock_store_u02', 'joined', 1, '田中けん', 'https://i.pravatar.cc/200?u=mock_store_u02', now() - interval '3 days'),
  ('b0000001-0000-4000-8000-00000000000c', 'mock_store_u03', 'joined', 1, '鈴木ゆい', 'https://i.pravatar.cc/200?u=mock_store_u03', now() - interval '3 days'),
  ('b0000001-0000-4000-8000-00000000000c', 'mock_store_u04', 'joined', 1, '高橋りく', 'https://i.pravatar.cc/200?u=mock_store_u04', now() - interval '2 days'),
  ('b0000001-0000-4000-8000-00000000000c', 'mock_store_u05', 'joined', 1, '伊藤あや', 'https://i.pravatar.cc/200?u=mock_store_u05', now() - interval '2 days'),
  ('b0000001-0000-4000-8000-00000000000c', 'mock_store_u06', 'joined', 1, '渡辺そうた', 'https://i.pravatar.cc/200?u=mock_store_u06', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-00000000000c', 'mock_store_u08', 'joined', 1, '中村だいき', 'https://i.pravatar.cc/200?u=mock_store_u08', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-00000000000c', 'mock_store_u10', 'joined', 1, '加藤ひろ', 'https://i.pravatar.cc/200?u=mock_store_u10', now() - interval '8 hours'),
  ('b0000001-0000-4000-8000-00000000000c', 'mock_store_u12', 'joined', 1, '松本ゆうき', 'https://i.pravatar.cc/200?u=mock_store_u12', now() - interval '4 hours'),
  ('b0000001-0000-4000-8000-00000000000d', 'mock_store_host_shinjuku', 'joined', 1, '新宿スポーツ会', 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=400&q=80', now() - interval '3 days'),
  ('b0000001-0000-4000-8000-00000000000d', 'mock_store_u01', 'joined', 1, '佐藤みお', 'https://i.pravatar.cc/200?u=mock_store_u01', now() - interval '2 days'),
  ('b0000001-0000-4000-8000-00000000000d', 'mock_store_u05', 'joined', 1, '伊藤あや', 'https://i.pravatar.cc/200?u=mock_store_u05', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-00000000000d', 'mock_store_u09', 'joined', 1, '小林めい', 'https://i.pravatar.cc/200?u=mock_store_u09', now() - interval '8 hours'),
  ('b0000001-0000-4000-8000-00000000000d', 'mock_store_u11', 'joined', 1, '斎藤はるか', 'https://i.pravatar.cc/200?u=mock_store_u11', now() - interval '4 hours'),
  ('b0000001-0000-4000-8000-00000000000e', 'mock_store_host_shinjuku', 'joined', 1, '新宿スポーツ会', 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=400&q=80', now() - interval '2 days'),
  ('b0000001-0000-4000-8000-00000000000e', 'mock_store_u02', 'joined', 1, '田中けん', 'https://i.pravatar.cc/200?u=mock_store_u02', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-00000000000e', 'mock_store_u04', 'joined', 1, '高橋りく', 'https://i.pravatar.cc/200?u=mock_store_u04', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-00000000000e', 'mock_store_u06', 'joined', 1, '渡辺そうた', 'https://i.pravatar.cc/200?u=mock_store_u06', now() - interval '12 hours'),
  ('b0000001-0000-4000-8000-00000000000e', 'mock_store_u08', 'joined', 1, '中村だいき', 'https://i.pravatar.cc/200?u=mock_store_u08', now() - interval '6 hours'),
  ('b0000001-0000-4000-8000-00000000000e', 'mock_store_u12', 'joined', 1, '松本ゆうき', 'https://i.pravatar.cc/200?u=mock_store_u12', now() - interval '3 hours'),
  ('b0000001-0000-4000-8000-00000000000f', 'mock_store_host_meguro', 'joined', 1, '目黒エンジョイクラブ', 'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?auto=format&fit=crop&w=400&q=80', now() - interval '3 days'),
  ('b0000001-0000-4000-8000-00000000000f', 'mock_store_u01', 'joined', 1, '佐藤みお', 'https://i.pravatar.cc/200?u=mock_store_u01', now() - interval '2 days'),
  ('b0000001-0000-4000-8000-00000000000f', 'mock_store_u03', 'joined', 1, '鈴木ゆい', 'https://i.pravatar.cc/200?u=mock_store_u03', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-00000000000f', 'mock_store_u07', 'joined', 1, '山本なな', 'https://i.pravatar.cc/200?u=mock_store_u07', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-00000000000f', 'mock_store_u09', 'joined', 1, '小林めい', 'https://i.pravatar.cc/200?u=mock_store_u09', now() - interval '10 hours'),
  ('b0000001-0000-4000-8000-00000000000f', 'mock_store_u11', 'joined', 1, '斎藤はるか', 'https://i.pravatar.cc/200?u=mock_store_u11', now() - interval '5 hours'),
  ('b0000001-0000-4000-8000-000000000010', 'mock_store_host_meguro', 'joined', 1, '目黒エンジョイクラブ', 'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?auto=format&fit=crop&w=400&q=80', now() - interval '2 days'),
  ('b0000001-0000-4000-8000-000000000010', 'mock_store_u02', 'joined', 1, '田中けん', 'https://i.pravatar.cc/200?u=mock_store_u02', now() - interval '1 day'),
  ('b0000001-0000-4000-8000-000000000010', 'mock_store_u05', 'joined', 1, '伊藤あや', 'https://i.pravatar.cc/200?u=mock_store_u05', now() - interval '20 hours'),
  ('b0000001-0000-4000-8000-000000000010', 'mock_store_u08', 'joined', 1, '中村だいき', 'https://i.pravatar.cc/200?u=mock_store_u08', now() - interval '8 hours'),
  ('b0000001-0000-4000-8000-000000000010', 'mock_store_u10', 'joined', 1, '加藤ひろ', 'https://i.pravatar.cc/200?u=mock_store_u10', now() - interval '4 hours');

update public.events e
set joined_count = coalesce((
  select sum(greatest(1, coalesce(p.ticket_quantity, 1)))::int
  from public.event_participants p
  where p.event_id = e.id and (p.status = 'joined' or p.status is null)
), 1),
updated_at = now()
where e.id::text like 'b0000001-0000-4000-8000-%';

commit;

select
  title, sport, location, event_date, event_time,
  price_yen, capacity, joined_count, host_name
from public.events
where host_id like 'mock_store_%'
order by event_date, event_time;
