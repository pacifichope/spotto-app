-- =============================================================================
-- QA モック: クラブ（サークル）＋イベント＋参加者＋チャット
-- =============================================================================
-- 使い方（どれか）:
--   1) Supabase Dashboard → SQL Editor でこのファイル全文を実行
--   2) node scripts/seed-mock-qa.mjs   （SERVICE_ROLE キーが必要）
--   3) psql "$DATABASE_URL" -f supabase/seed_mock_qa.sql
--
-- 特徴:
--   - 再実行安全（mock_qa_* / 固定 UUID を先に削除してから入れ直す）
--   - Firebase Auth UID 形式の text ID（auth.users 不要）
--   - service_role / SQL Editor（RLS バイパス）前提
--
-- カバーする条件:
--   クラブ: アクティブ大型 / 新規少人数 / bio・画像充実
--   イベント: 開催間近・定員間近・満員・無料・有料・複数チケット
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) クリーンアップ（前回の QA モックのみ）
-- ---------------------------------------------------------------------------
delete from public.chat_messages
where event_id in (
  'a0000001-0000-4000-8000-000000000001'::uuid,
  'a0000001-0000-4000-8000-000000000002'::uuid,
  'a0000001-0000-4000-8000-000000000003'::uuid,
  'a0000001-0000-4000-8000-000000000004'::uuid,
  'a0000001-0000-4000-8000-000000000005'::uuid,
  'a0000001-0000-4000-8000-000000000006'::uuid,
  'a0000001-0000-4000-8000-000000000007'::uuid,
  'a0000001-0000-4000-8000-000000000011'::uuid,
  'a0000001-0000-4000-8000-000000000012'::uuid,
  'a0000001-0000-4000-8000-000000000013'::uuid,
  'a0000001-0000-4000-8000-000000000014'::uuid,
  'a0000001-0000-4000-8000-000000000015'::uuid,
  'a0000001-0000-4000-8000-000000000016'::uuid,
  'a0000001-0000-4000-8000-000000000017'::uuid,
  'a0000001-0000-4000-8000-000000000018'::uuid,
  'a0000001-0000-4000-8000-000000000019'::uuid,
  'a0000001-0000-4000-8000-00000000001a'::uuid,
  'a0000001-0000-4000-8000-00000000001b'::uuid
)
or sender_id like 'mock_qa_%';

delete from public.event_participants
where event_id in (
  'a0000001-0000-4000-8000-000000000001'::uuid,
  'a0000001-0000-4000-8000-000000000002'::uuid,
  'a0000001-0000-4000-8000-000000000003'::uuid,
  'a0000001-0000-4000-8000-000000000004'::uuid,
  'a0000001-0000-4000-8000-000000000005'::uuid,
  'a0000001-0000-4000-8000-000000000006'::uuid,
  'a0000001-0000-4000-8000-000000000007'::uuid,
  'a0000001-0000-4000-8000-000000000011'::uuid,
  'a0000001-0000-4000-8000-000000000012'::uuid,
  'a0000001-0000-4000-8000-000000000013'::uuid,
  'a0000001-0000-4000-8000-000000000014'::uuid,
  'a0000001-0000-4000-8000-000000000015'::uuid,
  'a0000001-0000-4000-8000-000000000016'::uuid,
  'a0000001-0000-4000-8000-000000000017'::uuid,
  'a0000001-0000-4000-8000-000000000018'::uuid,
  'a0000001-0000-4000-8000-000000000019'::uuid,
  'a0000001-0000-4000-8000-00000000001a'::uuid,
  'a0000001-0000-4000-8000-00000000001b'::uuid
)
or user_id like 'mock_qa_%';

delete from public.events
where id in (
  'a0000001-0000-4000-8000-000000000001'::uuid,
  'a0000001-0000-4000-8000-000000000002'::uuid,
  'a0000001-0000-4000-8000-000000000003'::uuid,
  'a0000001-0000-4000-8000-000000000004'::uuid,
  'a0000001-0000-4000-8000-000000000005'::uuid,
  'a0000001-0000-4000-8000-000000000006'::uuid,
  'a0000001-0000-4000-8000-000000000007'::uuid,
  'a0000001-0000-4000-8000-000000000011'::uuid,
  'a0000001-0000-4000-8000-000000000012'::uuid,
  'a0000001-0000-4000-8000-000000000013'::uuid,
  'a0000001-0000-4000-8000-000000000014'::uuid,
  'a0000001-0000-4000-8000-000000000015'::uuid,
  'a0000001-0000-4000-8000-000000000016'::uuid,
  'a0000001-0000-4000-8000-000000000017'::uuid,
  'a0000001-0000-4000-8000-000000000018'::uuid,
  'a0000001-0000-4000-8000-000000000019'::uuid,
  'a0000001-0000-4000-8000-00000000001a'::uuid,
  'a0000001-0000-4000-8000-00000000001b'::uuid
)
or host_id like 'mock_qa_%'
or title like '[QA]%';

delete from public.profiles where id like 'mock_qa_%';

-- ---------------------------------------------------------------------------
-- 1) モックユーザー（profiles）= クラブ主催者 + 参加者
--    ※ クラブは host_id 単位。画像は主催サークル用 / 個人アバターを分離
-- ---------------------------------------------------------------------------
insert into public.profiles (id, display_name, nickname, gender, avatar_url, updated_at)
values
  -- アクティブ大型クラブ主催（フットサル）
  (
    'mock_qa_host_futsal',
    '渋谷ナイトフットサル',
    '渋谷ナイトフットサル',
    '男性',
    'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=400&q=80',
    now()
  ),
  -- 新規少人数クラブ主催（ランニング）
  (
    'mock_qa_host_run_new',
    '青山ゆるラン新設',
    '青山ゆるラン新設',
    '女性',
    'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=400&q=80',
    now()
  ),
  -- bio・画像充実のアウトドアクラブ主催
  (
    'mock_qa_host_outdoor',
    '多摩川アウトドア部',
    '多摩川アウトドア部',
    '男性',
    'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=400&q=80',
    now()
  ),
  -- 同一主催・複数独立イベントの検証用クラブ
  (
    'mock_qa_host_osushi',
    'おすし',
    'おすし',
    '男性',
    'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=400&q=80',
    now()
  ),
  -- 同一タイトル・異なる日付（日付切替で別ID）の検証用
  (
    'mock_qa_host_bball',
    'バスケラボ',
    'バスケラボ',
    '男性',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
    now()
  ),
  -- 参加者たち（個人アバター）
  ('mock_qa_user_01', '佐藤みお', 'みお', '女性', 'https://i.pravatar.cc/200?u=mock_qa_user_01', now()),
  ('mock_qa_user_02', '田中けん', 'けん', '男性', 'https://i.pravatar.cc/200?u=mock_qa_user_02', now()),
  ('mock_qa_user_03', '鈴木ゆい', 'ゆい', '女性', 'https://i.pravatar.cc/200?u=mock_qa_user_03', now()),
  ('mock_qa_user_04', '高橋りく', 'りく', '男性', 'https://i.pravatar.cc/200?u=mock_qa_user_04', now()),
  ('mock_qa_user_05', '伊藤あや', 'あや', '女性', 'https://i.pravatar.cc/200?u=mock_qa_user_05', now()),
  ('mock_qa_user_06', '渡辺そうた', 'そうた', '男性', 'https://i.pravatar.cc/200?u=mock_qa_user_06', now()),
  ('mock_qa_user_07', '山本なな', 'なな', '女性', 'https://i.pravatar.cc/200?u=mock_qa_user_07', now()),
  ('mock_qa_user_08', '中村だいき', 'だいき', '男性', 'https://i.pravatar.cc/200?u=mock_qa_user_08', now()),
  ('mock_qa_user_09', '小林めい', 'めい', '女性', 'https://i.pravatar.cc/200?u=mock_qa_user_09', now()),
  ('mock_qa_user_10', '加藤ひろ', 'ひろ', '男性', 'https://i.pravatar.cc/200?u=mock_qa_user_10', now()),
  -- 複数チケット購入ユーザー
  ('mock_qa_user_multi', '複数枚太郎', '複数枚', '男性', 'https://i.pravatar.cc/200?u=mock_qa_user_multi', now())
on conflict (id) do update set
  display_name = excluded.display_name,
  nickname = excluded.nickname,
  gender = excluded.gender,
  avatar_url = excluded.avatar_url,
  updated_at = excluded.updated_at;

-- ---------------------------------------------------------------------------
-- 2) イベント（日時は Asia/Tokyo・「翌月以降」固定）
--    審査・動作確認用に、直近数時間〜数日ではなく翌月11日以降へ配置
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
  soon as (
    -- 翌月ウィンドウ内の平日夜（day0 + 2日 19:00）
    select
      (d.d + 2) + time '19:00' as start_at,
      (d.d + 2) + time '21:00' as end_at
    from day0 d
  ),
  tonight as (
    select
      (d.d + 3) + time '19:00' as start_at,
      (d.d + 3) + time '21:00' as end_at
    from day0 d
  ),
  weekend as (
    select
      (d.d + ((6 - extract(dow from d.d)::int + 7) % 7))::date + time '10:00' as start_at,
      (d.d + ((6 - extract(dow from d.d)::int + 7) % 7))::date + time '12:00' as end_at
    from day0 d
  )
insert into public.events (
  id,
  host_id,
  title,
  sport,
  emoji,
  location,
  location_note,
  event_date,
  event_time,
  end_date,
  end_time,
  schedule_type,
  level,
  target_age_groups,
  latitude,
  longitude,
  capacity,
  joined_count,
  host_name,
  host_image_uri,
  host_bio,
  host_sns_links,
  vibe,
  description,
  image_uri,
  image_uris,
  accent,
  registration_deadline_offset,
  waitlist_enabled,
  waitlist_count,
  enable_pre_questions,
  items_to_bring,
  included_items,
  price_yen,
  cancel_policy,
  created_at,
  updated_at
)
values
-- ① 開催間近（約3時間後）・参加者数名・無料寄り雰囲気 / 有料 1,000円
(
  'a0000001-0000-4000-8000-000000000001',
  'mock_qa_host_futsal',
  '[QA] 開催間近！渋谷ナイトフットサル',
  'フットサル',
  '⚽',
  '東京都渋谷区神南1-1',
  '体育館エントランス集合',
  to_char((select start_at from soon), 'YYYY-MM-DD'),
  to_char((select start_at from soon), 'HH24:MI'),
  to_char((select end_at from soon), 'YYYY-MM-DD'),
  to_char((select end_at from soon), 'HH24:MI'),
  'single',
  '誰でも歓迎',
  array['20代','30代'],
  35.6628,
  139.6982,
  16,
  0, -- participants 挿入後に trigger で再計算
  '渋谷ナイトフットサル',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=400&q=80',
  '渋谷周辺で週2ナイトフットサル。初心者〜中級、楽しく走れるペース優先。更衣室あり、シューズ必携。',
  '[{"id":"qa-ig","kind":"instagram","url":"https://instagram.com/"}]'::jsonb,
  '開催3時間前・少人数スタート',
  E'【QAモック①】開催間近イベント\n数時間後スタート。参加者アバター・チャット・参加ボタンの最終確認用。\n集合は正面玄関、開始10分前集合。',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80'
  ],
  '#0EA5E9',
  '0',
  false,
  0,
  false,
  array['室内シューズ','着替え','飲み物'],
  array['ビブス','ボール'],
  1000,
  '開始24時間前まで全額返金',
  now(),
  now()
),
-- ②-a 定員間近（残り1）・有料 1,500円
(
  'a0000001-0000-4000-8000-000000000002',
  'mock_qa_host_futsal',
  '[QA] 定員間近 恵比寿インドアフットサル',
  'フットサル',
  '⚽',
  '東京都渋谷区恵比寿南1-5',
  'インドアコート B',
  to_char((select start_at from tonight), 'YYYY-MM-DD'),
  to_char((select start_at from tonight), 'HH24:MI'),
  to_char((select end_at from tonight), 'YYYY-MM-DD'),
  to_char((select end_at from tonight), 'HH24:MI'),
  'single',
  '中級',
  array['20代','30代','40代'],
  35.6467,
  139.7101,
  10,
  0,
  '渋谷ナイトフットサル',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=400&q=80',
  '渋谷周辺で週2ナイトフットサル。初心者〜中級、楽しく走れるペース優先。更衣室あり、シューズ必携。',
  '[{"id":"qa-ig","kind":"instagram","url":"https://instagram.com/"}]'::jsonb,
  '残りわずか・有料1,500円',
  E'【QAモック②】定員間近\ncapacity=10 / 参加チケット合計=9 で残り1枠。満員表示直前の UI 確認用。',
  'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80'
  ],
  '#F97316',
  '0',
  false,
  0,
  false,
  array['室内シューズ'],
  array['ビブス'],
  1500,
  '開始48時間前まで全額返金',
  now(),
  now()
),
-- ②-b 満員（Capacity 上限ちょうど）
(
  'a0000001-0000-4000-8000-000000000003',
  'mock_qa_host_futsal',
  '[QA] 満員 週末フットサルマッチ',
  'フットサル',
  '⚽',
  '東京都目黒区下目黒2-1',
  'コート1',
  to_char((select start_at from weekend), 'YYYY-MM-DD'),
  to_char((select start_at from weekend), 'HH24:MI'),
  to_char((select end_at from weekend), 'YYYY-MM-DD'),
  to_char((select end_at from weekend), 'HH24:MI'),
  'single',
  '誰でも歓迎',
  array['全年齢'],
  35.6335,
  139.7155,
  8,
  0,
  '渋谷ナイトフットサル',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=400&q=80',
  '渋谷周辺で週2ナイトフットサル。初心者〜中級、楽しく走れるペース優先。更衣室あり、シューズ必携。',
  '[]'::jsonb,
  '満員（受付終了）',
  E'【QAモック②満員】joined_count = capacity。満員（受付終了）UI 確認用。',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1200&q=80'
  ],
  '#EF4444',
  '0',
  false,
  0,
  false,
  array['シューズ'],
  array['ボール'],
  1200,
  '開始24時間前まで全額返金',
  now(),
  now()
),
-- ③-a 無料イベント（ランニング・新規クラブ）
(
  'a0000001-0000-4000-8000-000000000004',
  'mock_qa_host_run_new',
  '[QA] 無料 青山ゆる朝ラン（新規クラブ）',
  'ランニング',
  '🏃',
  '東京都港区北青山3',
  '地下鉄出口すぐ',
  to_char((select start_at from weekend), 'YYYY-MM-DD'),
  '07:30',
  to_char((select start_at from weekend), 'YYYY-MM-DD'),
  '08:30',
  'single',
  '初心者',
  array['20代','30代'],
  35.6654,
  139.7121,
  12,
  0,
  '青山ゆるラン新設',
  'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=400&q=80',
  '2026年設立のゆる朝ラン。会話できるペース、コーヒー終わりつき。メンバー募集中です！',
  '[]'::jsonb,
  '無料・新規クラブ',
  E'【QAモック③無料 / 新規少人数クラブ】\n参加費0円。主催者+参加者1名程度のスモールクラブ表示確認用。',
  'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1486218119243-13883505764c?auto=format&fit=crop&w=1200&q=80'
  ],
  '#22C55E',
  '0',
  false,
  0,
  false,
  array['走りやすい靴'],
  '{}'::text[],
  0,
  null,
  now(),
  now()
),
-- ③-b / ④ 有料 1,500円 + 複数チケット購入ユーザーあり
(
  'a0000001-0000-4000-8000-000000000005',
  'mock_qa_host_outdoor',
  '[QA] 有料＆複数チケット 多摩川キャッチボール会',
  '野球',
  '⚾',
  '東京都大田区多摩川河川敷',
  '野球広場エントランス',
  to_char((select start_at from tonight), 'YYYY-MM-DD'),
  '14:00',
  to_char((select start_at from tonight), 'YYYY-MM-DD'),
  '16:00',
  'single',
  '誰でも歓迎',
  array['全年齢'],
  35.5512,
  139.6750,
  20,
  0,
  '多摩川アウトドア部',
  'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=400&q=80',
  E'多摩川〜皇居周辺でアウトドア系スポーツを定期開催。\nキャッチボール・ゆるラン・ピクニック交流もあります。\nグローブ持参歓迎、初心者OK。写真多め・説明文しっかりのクラブ確認用。',
  '[{"id":"qa-x","kind":"x","url":"https://x.com/"},{"id":"qa-web","kind":"web","url":"https://example.com"}]'::jsonb,
  '有料1,500円・複数枚チケットあり',
  E'【QAモック③有料 / ④複数チケット】\n1ユーザーが ticket_quantity=3 で参加。アバターバッジ・定員消費の確認用。',
  'https://images.unsplash.com/photo-1529768167801-9173d94c2a42?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1529768167801-9173d94c2a42?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1508804185872-d7aad8140fb5?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=1200&q=80'
  ],
  '#84CC16',
  '0',
  false,
  0,
  false,
  array['グローブ（任意）','帽子'],
  array['ボール'],
  1500,
  '開始24時間前まで全額返金',
  now(),
  now()
),
-- 充実クラブの2本目イベント（クラブ詳細の活動一覧用）
(
  'a0000001-0000-4000-8000-000000000006',
  'mock_qa_host_outdoor',
  '[QA] 多摩川ゆるラン＆ストレッチ',
  'ランニング',
  '🏃',
  '東京都大田区多摩川河川敷',
  '上流側ベンチ集合',
  to_char((select start_at from weekend) + interval '1 day', 'YYYY-MM-DD'),
  '09:00',
  to_char((select start_at from weekend) + interval '1 day', 'YYYY-MM-DD'),
  '10:30',
  'single',
  '初心者',
  array['20代','30代','40代'],
  35.5520,
  139.6760,
  15,
  0,
  '多摩川アウトドア部',
  'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=400&q=80',
  E'多摩川〜皇居周辺でアウトドア系スポーツを定期開催。\nキャッチボール・ゆるラン・ピクニック交流もあります。\nグローブ持参歓迎、初心者OK。写真多め・説明文しっかりのクラブ確認用。',
  '[{"id":"qa-x","kind":"x","url":"https://x.com/"}]'::jsonb,
  'クラブ活動2本目',
  E'【QAモック】同じ host_id の2本目。クラブ詳細のアクティビティ一覧確認用。有料800円。',
  'https://images.unsplash.com/photo-1486218119243-13883505764c?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1486218119243-13883505764c?auto=format&fit=crop&w=1200&q=80'
  ],
  '#14B8A6',
  '0',
  false,
  0,
  false,
  array['走りやすい靴'],
  '{}'::text[],
  800,
  null,
  now(),
  now()
),
-- アクティブクラブの追加回（参加者多め）
(
  'a0000001-0000-4000-8000-000000000007',
  'mock_qa_host_futsal',
  '[QA] 平日ランチタイム・フットサル交流',
  'フットサル',
  '⚽',
  '東京都渋谷区代々木2',
  'コートC',
  to_char((select start_at from weekend) + interval '2 days', 'YYYY-MM-DD'),
  '12:00',
  to_char((select start_at from weekend) + interval '2 days', 'YYYY-MM-DD'),
  '13:30',
  'single',
  '誰でも歓迎',
  array['全年齢'],
  35.6710,
  139.6950,
  14,
  0,
  '渋谷ナイトフットサル',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=400&q=80',
  '渋谷周辺で週2ナイトフットサル。初心者〜中級、楽しく走れるペース優先。更衣室あり、シューズ必携。',
  '[]'::jsonb,
  'アクティブクラブ追加回',
  E'【QAモック】アクティブクラブの追加イベント。参加者リスト・チャット確認用。',
  'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80'
  ],
  '#3B82F6',
  '0',
  false,
  0,
  false,
  array['シューズ'],
  array['ビブス'],
  0,
  null,
  now(),
  now()
),
-- ---------------------------------------------------------------------------
-- おすしクラブ: 同一主催・タイトルの異なる独立イベント（詳細分離の検証）
-- ---------------------------------------------------------------------------
(
  'a0000001-0000-4000-8000-000000000011',
  'mock_qa_host_osushi',
  '[QA] おすしサッカー練習会',
  'サッカー',
  '⚽',
  '東京都渋谷区代々木神園町',
  '代々木公園球技場A・西側ゲート',
  to_char((select start_at from tonight), 'YYYY-MM-DD'),
  '19:00',
  to_char((select start_at from tonight), 'YYYY-MM-DD'),
  '21:00',
  'single',
  '誰でも歓迎',
  array['20代','30代'],
  35.6717,
  139.6949,
  18,
  0,
  'おすし',
  'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=400&q=80',
  '渋谷・代々木周辺でスポーツイベントを主催。初心者歓迎・気軽にどうぞ。',
  '[]'::jsonb,
  '平日夜のゆる練習',
  E'【QAモック】おすし主催①サッカー練習会\n別イベント（フットサル／バレー）とは独立した詳細ページになること。',
  'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=80'
  ],
  '#0EA5E9',
  '0',
  false,
  0,
  false,
  array['運動靴','タオル','飲み物'],
  array['ビブス','ボール'],
  800,
  '開催の2日前までキャンセル無料、以降は返金なし',
  now(),
  now()
),
(
  'a0000001-0000-4000-8000-000000000012',
  'mock_qa_host_osushi',
  '[QA] おすし週末フットサルマッチ',
  'フットサル',
  '⚽',
  '東京都渋谷区神南1',
  'インドアコートB・2階受付',
  to_char((select start_at from weekend), 'YYYY-MM-DD'),
  '14:00',
  to_char((select start_at from weekend), 'YYYY-MM-DD'),
  '16:00',
  'single',
  '中級',
  array['20代'],
  35.6595,
  139.7005,
  12,
  0,
  'おすし',
  'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=400&q=80',
  '渋谷・代々木周辺でスポーツイベントを主催。初心者歓迎・気軽にどうぞ。',
  '[]'::jsonb,
  '週末の試合形式',
  E'【QAモック】おすし主催②フットサルマッチ\nサッカー練習会・バレーゆる練とは別ID・別詳細。',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1200&q=80'
  ],
  '#10B981',
  '0',
  false,
  0,
  false,
  array['インドアシューズ','タオル'],
  array['ビブス','ボール'],
  1500,
  '開催の24時間前まで全額返金、以降は返金なし',
  now(),
  now()
),
(
  'a0000001-0000-4000-8000-000000000013',
  'mock_qa_host_osushi',
  '[QA] おすしバレーゆる練',
  'バレーボール',
  '🏐',
  '東京都渋谷区神宮前1',
  'コミュニティ体育館1階',
  to_char((select start_at from weekend) + interval '4 days', 'YYYY-MM-DD'),
  '20:00',
  to_char((select start_at from weekend) + interval '4 days', 'YYYY-MM-DD'),
  '22:00',
  'single',
  '初心者',
  array['全年齢'],
  35.6702,
  139.7028,
  16,
  0,
  'おすし',
  'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=400&q=80',
  '渋谷・代々木周辺でスポーツイベントを主催。初心者歓迎・気軽にどうぞ。',
  '[]'::jsonb,
  'レシーブ練習中心',
  E'【QAモック】おすし主催③バレーゆる練\n同一主催でもタイトルが違えば独立ページ。',
  'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?auto=format&fit=crop&w=1200&q=80'
  ],
  '#8B5CF6',
  '0',
  false,
  0,
  false,
  array['インドアシューズ','タオル'],
  array['ボール用意'],
  0,
  null,
  now(),
  now()
);

-- ---------------------------------------------------------------------------
-- 2b) 同一タイトル・複数開催日（8回）の独立イベントシリーズ
--     series_id 共通 / 各行は別 id（参加・定員・参加者は日付ごと独立）
--     詳細の Date / 活動時間で日付切替の検証用
-- ---------------------------------------------------------------------------
insert into public.events (
  id,
  host_id,
  title,
  sport,
  emoji,
  location,
  location_note,
  event_date,
  event_time,
  end_date,
  end_time,
  schedule_type,
  series_id,
  level,
  target_age_groups,
  latitude,
  longitude,
  capacity,
  joined_count,
  host_name,
  host_image_uri,
  host_bio,
  host_sns_links,
  vibe,
  description,
  image_uri,
  image_uris,
  accent,
  registration_deadline_offset,
  waitlist_enabled,
  waitlist_count,
  enable_pre_questions,
  items_to_bring,
  included_items,
  price_yen,
  cancel_policy,
  created_at,
  updated_at
)
select
  ('a0000001-0000-4000-8000-' || lpad(to_hex(20 + g.ord), 12, '0'))::uuid,
  'mock_qa_host_bball',
  '[QA] 平日夜バスケ練習',
  'バスケ',
  '🏀',
  '東京都渋谷区宇田川町',
  '区立体育館・1階受付',
  to_char(g.starts_on, 'YYYY-MM-DD'),
  '19:30',
  to_char(g.starts_on, 'YYYY-MM-DD'),
  '21:30',
  'single',
  'a0000001-0000-4000-8000-000000000099',
  '誰でも歓迎',
  array['20代','30代'],
  35.6612,
  139.7042,
  16,
  0,
  'バスケラボ',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
  '渋谷周辺でバスケ練習会を開催しています。',
  '[]'::jsonb,
  'パス回し中心のゆる練',
  format(
    E'【QAモック】平日夜バスケ 第%s回（%s）\n同一タイトルの他日付とは別イベントIDです。\n詳細で日付を切り替えると参加状態・参加者・定員が変わること。',
    g.ord + 1,
    to_char(g.starts_on, 'YYYY-MM-DD')
  ),
  'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80',
  array[
    'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80'
  ],
  '#F97316',
  '0',
  false,
  0,
  false,
  array['室内シューズ','タオル'],
  array['ボール'],
  500,
  '開催の24時間前まで全額返金、以降は返金なし',
  now(),
  now()
from (
  select
    ord,
    (
      greatest(
        (
          date_trunc('month', timezone('Asia/Tokyo', now())::date::timestamp)
          + interval '1 month'
        )::date + 10,
        date '2026-10-11'
      ) + (ord * 2)
    ) as starts_on
  from generate_series(0, 7) as ord
) g;

-- ---------------------------------------------------------------------------
-- 3) 参加者（ticket_quantity 込み）→ joined_count は trigger で同期
-- ---------------------------------------------------------------------------

-- ① 開催間近: 主催 + 3名
insert into public.event_participants (
  event_id, user_id, status, ticket_quantity, display_name, avatar_url, created_at
) values
  ('a0000001-0000-4000-8000-000000000001', 'mock_qa_host_futsal', 'joined', 1,
   '渋谷ナイトフットサル',
   'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=400&q=80',
   now() - interval '2 days'),
  ('a0000001-0000-4000-8000-000000000001', 'mock_qa_user_01', 'joined', 1,
   '佐藤みお', 'https://i.pravatar.cc/200?u=mock_qa_user_01', now() - interval '1 day'),
  ('a0000001-0000-4000-8000-000000000001', 'mock_qa_user_02', 'joined', 1,
   '田中けん', 'https://i.pravatar.cc/200?u=mock_qa_user_02', now() - interval '20 hours'),
  ('a0000001-0000-4000-8000-000000000001', 'mock_qa_user_03', 'joined', 1,
   '鈴木ゆい', 'https://i.pravatar.cc/200?u=mock_qa_user_03', now() - interval '5 hours');

-- ② 定員間近: 9/10（主催1 + 通常7 + 複数枚ユーザーは別イベント）
insert into public.event_participants (
  event_id, user_id, status, ticket_quantity, display_name, avatar_url, created_at
) values
  ('a0000001-0000-4000-8000-000000000002', 'mock_qa_host_futsal', 'joined', 1,
   '渋谷ナイトフットサル',
   'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=400&q=80',
   now() - interval '3 days'),
  ('a0000001-0000-4000-8000-000000000002', 'mock_qa_user_01', 'joined', 1, '佐藤みお', 'https://i.pravatar.cc/200?u=mock_qa_user_01', now() - interval '2 days'),
  ('a0000001-0000-4000-8000-000000000002', 'mock_qa_user_02', 'joined', 1, '田中けん', 'https://i.pravatar.cc/200?u=mock_qa_user_02', now() - interval '2 days'),
  ('a0000001-0000-4000-8000-000000000002', 'mock_qa_user_03', 'joined', 1, '鈴木ゆい', 'https://i.pravatar.cc/200?u=mock_qa_user_03', now() - interval '36 hours'),
  ('a0000001-0000-4000-8000-000000000002', 'mock_qa_user_04', 'joined', 1, '高橋りく', 'https://i.pravatar.cc/200?u=mock_qa_user_04', now() - interval '30 hours'),
  ('a0000001-0000-4000-8000-000000000002', 'mock_qa_user_05', 'joined', 1, '伊藤あや', 'https://i.pravatar.cc/200?u=mock_qa_user_05', now() - interval '24 hours'),
  ('a0000001-0000-4000-8000-000000000002', 'mock_qa_user_06', 'joined', 1, '渡辺そうた', 'https://i.pravatar.cc/200?u=mock_qa_user_06', now() - interval '18 hours'),
  ('a0000001-0000-4000-8000-000000000002', 'mock_qa_user_07', 'joined', 2, '山本なな', 'https://i.pravatar.cc/200?u=mock_qa_user_07', now() - interval '12 hours');
  -- 合計チケット: 1+1+1+1+1+1+1+2 = 9 → 残り1

-- ②満員: 8/8（受付終了）
insert into public.event_participants (
  event_id, user_id, status, ticket_quantity, display_name, avatar_url, created_at
) values
  ('a0000001-0000-4000-8000-000000000003', 'mock_qa_host_futsal', 'joined', 1, '渋谷ナイトフットサル', 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=400&q=80', now() - interval '4 days'),
  ('a0000001-0000-4000-8000-000000000003', 'mock_qa_user_01', 'joined', 1, '佐藤みお', 'https://i.pravatar.cc/200?u=mock_qa_user_01', now() - interval '3 days'),
  ('a0000001-0000-4000-8000-000000000003', 'mock_qa_user_02', 'joined', 1, '田中けん', 'https://i.pravatar.cc/200?u=mock_qa_user_02', now() - interval '3 days'),
  ('a0000001-0000-4000-8000-000000000003', 'mock_qa_user_03', 'joined', 1, '鈴木ゆい', 'https://i.pravatar.cc/200?u=mock_qa_user_03', now() - interval '2 days'),
  ('a0000001-0000-4000-8000-000000000003', 'mock_qa_user_04', 'joined', 1, '高橋りく', 'https://i.pravatar.cc/200?u=mock_qa_user_04', now() - interval '2 days'),
  ('a0000001-0000-4000-8000-000000000003', 'mock_qa_user_05', 'joined', 1, '伊藤あや', 'https://i.pravatar.cc/200?u=mock_qa_user_05', now() - interval '1 day'),
  ('a0000001-0000-4000-8000-000000000003', 'mock_qa_user_06', 'joined', 1, '渡辺そうた', 'https://i.pravatar.cc/200?u=mock_qa_user_06', now() - interval '20 hours'),
  ('a0000001-0000-4000-8000-000000000003', 'mock_qa_user_08', 'joined', 1, '中村だいき', 'https://i.pravatar.cc/200?u=mock_qa_user_08', now() - interval '10 hours');

-- ③無料・新規クラブ: 主催のみ + 1名（少人数）
insert into public.event_participants (
  event_id, user_id, status, ticket_quantity, display_name, avatar_url, created_at
) values
  ('a0000001-0000-4000-8000-000000000004', 'mock_qa_host_run_new', 'joined', 1,
   '青山ゆるラン新設',
   'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=400&q=80',
   now() - interval '1 day'),
  ('a0000001-0000-4000-8000-000000000004', 'mock_qa_user_05', 'joined', 1,
   '伊藤あや', 'https://i.pravatar.cc/200?u=mock_qa_user_05', now() - interval '8 hours');

-- ④ 複数チケット: 主催1 + multi×3 + 他2名×1 = 合計6枠
insert into public.event_participants (
  event_id, user_id, status, ticket_quantity, display_name, avatar_url, created_at
) values
  ('a0000001-0000-4000-8000-000000000005', 'mock_qa_host_outdoor', 'joined', 1,
   '多摩川アウトドア部',
   'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=400&q=80',
   now() - interval '2 days'),
  ('a0000001-0000-4000-8000-000000000005', 'mock_qa_user_multi', 'joined', 3,
   '複数枚太郎', 'https://i.pravatar.cc/200?u=mock_qa_user_multi', now() - interval '1 day'),
  ('a0000001-0000-4000-8000-000000000005', 'mock_qa_user_01', 'joined', 1,
   '佐藤みお', 'https://i.pravatar.cc/200?u=mock_qa_user_01', now() - interval '12 hours'),
  ('a0000001-0000-4000-8000-000000000005', 'mock_qa_user_04', 'joined', 1,
   '高橋りく', 'https://i.pravatar.cc/200?u=mock_qa_user_04', now() - interval '6 hours');

-- 充実クラブ2本目
insert into public.event_participants (
  event_id, user_id, status, ticket_quantity, display_name, avatar_url, created_at
) values
  ('a0000001-0000-4000-8000-000000000006', 'mock_qa_host_outdoor', 'joined', 1,
   '多摩川アウトドア部',
   'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=400&q=80',
   now() - interval '1 day'),
  ('a0000001-0000-4000-8000-000000000006', 'mock_qa_user_02', 'joined', 1,
   '田中けん', 'https://i.pravatar.cc/200?u=mock_qa_user_02', now() - interval '10 hours'),
  ('a0000001-0000-4000-8000-000000000006', 'mock_qa_user_03', 'joined', 1,
   '鈴木ゆい', 'https://i.pravatar.cc/200?u=mock_qa_user_03', now() - interval '4 hours');

-- アクティブ追加回
insert into public.event_participants (
  event_id, user_id, status, ticket_quantity, display_name, avatar_url, created_at
) values
  ('a0000001-0000-4000-8000-000000000007', 'mock_qa_host_futsal', 'joined', 1,
   '渋谷ナイトフットサル',
   'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=400&q=80',
   now() - interval '2 days'),
  ('a0000001-0000-4000-8000-000000000007', 'mock_qa_user_06', 'joined', 1, '渡辺そうた', 'https://i.pravatar.cc/200?u=mock_qa_user_06', now() - interval '1 day'),
  ('a0000001-0000-4000-8000-000000000007', 'mock_qa_user_07', 'joined', 1, '山本なな', 'https://i.pravatar.cc/200?u=mock_qa_user_07', now() - interval '20 hours'),
  ('a0000001-0000-4000-8000-000000000007', 'mock_qa_user_08', 'joined', 1, '中村だいき', 'https://i.pravatar.cc/200?u=mock_qa_user_08', now() - interval '8 hours'),
  ('a0000001-0000-4000-8000-000000000007', 'mock_qa_user_01', 'joined', 1, '佐藤みお', 'https://i.pravatar.cc/200?u=mock_qa_user_01', now() - interval '3 hours');

-- バスケ同一タイトル・8開催日: 主催 + 開催回ごとに異なる参加者
insert into public.event_participants (
  event_id, user_id, status, ticket_quantity, display_name, avatar_url, created_at
)
select
  e.id,
  'mock_qa_host_bball',
  'joined',
  1,
  'バスケラボ',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
  now() - interval '2 days'
from public.events e
where e.series_id = 'a0000001-0000-4000-8000-000000000099';

insert into public.event_participants (
  event_id, user_id, status, ticket_quantity, display_name, avatar_url, created_at
)
select
  ranked.id,
  u.user_id,
  'joined',
  1,
  u.display_name,
  u.avatar_url,
  now() - make_interval(hours => u.ago_h)
from (
  select
    e.id,
    (row_number() over (order by e.event_date, e.id) - 1)::int as slot
  from public.events e
  where e.series_id = 'a0000001-0000-4000-8000-000000000099'
) ranked
join (
  values
    (0, 'mock_qa_user_01', '佐藤みお', 'https://i.pravatar.cc/200?u=mock_qa_user_01', 24),
    (0, 'mock_qa_user_02', '田中けん', 'https://i.pravatar.cc/200?u=mock_qa_user_02', 18),
    (1, 'mock_qa_user_03', '鈴木ゆい', 'https://i.pravatar.cc/200?u=mock_qa_user_03', 20),
    (1, 'mock_qa_user_04', '高橋りく', 'https://i.pravatar.cc/200?u=mock_qa_user_04', 14),
    (1, 'mock_qa_user_05', '伊藤あや', 'https://i.pravatar.cc/200?u=mock_qa_user_05', 8),
    (2, 'mock_qa_user_06', '渡辺そうた', 'https://i.pravatar.cc/200?u=mock_qa_user_06', 16),
    (2, 'mock_qa_user_07', '山本なな', 'https://i.pravatar.cc/200?u=mock_qa_user_07', 10),
    (3, 'mock_qa_user_08', '中村だいき', 'https://i.pravatar.cc/200?u=mock_qa_user_08', 22),
    (3, 'mock_qa_user_09', '小林めい', 'https://i.pravatar.cc/200?u=mock_qa_user_09', 12),
    (3, 'mock_qa_user_10', '加藤ひろ', 'https://i.pravatar.cc/200?u=mock_qa_user_10', 6),
    (4, 'mock_qa_user_01', '佐藤みお', 'https://i.pravatar.cc/200?u=mock_qa_user_01', 15),
    (4, 'mock_qa_user_08', '中村だいき', 'https://i.pravatar.cc/200?u=mock_qa_user_08', 9),
    (5, 'mock_qa_user_02', '田中けん', 'https://i.pravatar.cc/200?u=mock_qa_user_02', 11),
    (5, 'mock_qa_user_05', '伊藤あや', 'https://i.pravatar.cc/200?u=mock_qa_user_05', 7),
    (5, 'mock_qa_user_09', '小林めい', 'https://i.pravatar.cc/200?u=mock_qa_user_09', 3),
    (6, 'mock_qa_user_03', '鈴木ゆい', 'https://i.pravatar.cc/200?u=mock_qa_user_03', 13),
    (6, 'mock_qa_user_06', '渡辺そうた', 'https://i.pravatar.cc/200?u=mock_qa_user_06', 5),
    (7, 'mock_qa_user_04', '高橋りく', 'https://i.pravatar.cc/200?u=mock_qa_user_04', 17),
    (7, 'mock_qa_user_07', '山本なな', 'https://i.pravatar.cc/200?u=mock_qa_user_07', 8),
    (7, 'mock_qa_user_10', '加藤ひろ', 'https://i.pravatar.cc/200?u=mock_qa_user_10', 2)
) as u(slot, user_id, display_name, avatar_url, ago_h)
  on u.slot = ranked.slot;

-- ---------------------------------------------------------------------------
-- 4) グループチャット（開催間近イベント）
-- ---------------------------------------------------------------------------
insert into public.chat_messages (
  event_id, mode, dm_user_id, sender_id, sender_name, sender_image_uri, body, created_at
) values
  (
    'a0000001-0000-4000-8000-000000000001',
    'group', null,
    'mock_qa_host_futsal',
    '渋谷ナイトフットサル',
    'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=400&q=80',
    '本日のコートは体育館2階です。開始10分前に正面集合でお願いします！',
    now() - interval '2 hours'
  ),
  (
    'a0000001-0000-4000-8000-000000000001',
    'group', null,
    'mock_qa_user_01',
    '佐藤みお',
    'https://i.pravatar.cc/200?u=mock_qa_user_01',
    '了解です！シューズ忘れないようにします👟',
    now() - interval '90 minutes'
  ),
  (
    'a0000001-0000-4000-8000-000000000001',
    'group', null,
    'mock_qa_user_02',
    '田中けん',
    'https://i.pravatar.cc/200?u=mock_qa_user_02',
    '初めて参加します。よろしくお願いします！',
    now() - interval '40 minutes'
  ),
  (
    'a0000001-0000-4000-8000-000000000005',
    'group', null,
    'mock_qa_host_outdoor',
    '多摩川アウトドア部',
    'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=400&q=80',
    '複数枚チケットの方も歓迎です。家族・友人とどうぞ！',
    now() - interval '1 day'
  ),
  (
    'a0000001-0000-4000-8000-000000000005',
    'group', null,
    'mock_qa_user_multi',
    '複数枚太郎',
    'https://i.pravatar.cc/200?u=mock_qa_user_multi',
    '3枚確保しました。当日3人で伺います！',
    now() - interval '20 hours'
  );

-- ---------------------------------------------------------------------------
-- 5) 検証用サマリ
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  raise notice '===== QA MOCK SUMMARY =====';
  for r in
    select
      e.title,
      e.sport,
      e.price_yen,
      e.capacity,
      e.joined_count,
      e.waitlist_count,
      e.event_date || ' ' || e.event_time as starts,
      e.host_id
    from public.events e
    where e.title like '[QA]%'
    order by e.title
  loop
    raise notice '% | ¥% | %/% (+wl %) | % | host=%',
      r.title, r.price_yen, r.joined_count, r.capacity, r.waitlist_count, r.starts, r.host_id;
  end loop;
end $$;

commit;

-- =============================================================================
-- チェックリスト（アプリ側）
-- =============================================================================
-- [ ] ホーム一覧に [QA] タイトルのイベントが並ぶ
-- [ ] ① 開催間近: 日時が数時間後、参加者アバターが数名
-- [ ] ② 定員間近: 残り1表示 / 満員: 受付終了
-- [ ] ③ 無料(¥0) と 有料(¥1,500) の表示差
-- [ ] ④ 複数枚太郎の参加者行にチケット枚数バッジ
-- [ ] クラブ詳細 mock_qa_host_futsal: イベント複数・bio・カバー画像
-- [ ] クラブ詳細 mock_qa_host_run_new: メンバー少・新規感
-- [ ] クラブ詳細 mock_qa_host_outdoor: 画像・bio・SNS 充実
-- [ ] おすし (mock_qa_host_osushi): サッカー／フットサル／バレーが別カード・別詳細
-- [ ] 各おすしイベントを開くとタイトル・日時・場所がタップしたカードと一致
-- [ ] 平日夜バスケ: 同一タイトルで8開催日（2日おき）。詳細で日付切替→参加者・定員が変わる
-- [ ] 開催間近イベントのグループチャットに3通
-- =============================================================================
