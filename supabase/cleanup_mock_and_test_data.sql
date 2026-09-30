-- =============================================================================
-- モック / テストデータ一括削除
-- =============================================================================
-- 対象:
--   - mock_qa_* / mock_store_* / mock_spotto_fc_* / mock_%
--   - 固定 UUID: a0000001-… / b0000001-…
--   - タイトル [QA]%
--   - 明らかな捨て打ちタイトル（あじぇへ / やっほー）
--   - demo_% の売上台帳
--   - 上記削除後の joined_count 再計算（SPOTTO FC の 1000 人表示など）
--
-- 使い方:
--   npm run cleanup:mock
--   または SQL Editor で全文 Run
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 関連テーブル（存在すれば）
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.chat_thread_reads') is not null then
    execute $q$
      delete from public.chat_thread_reads
      where user_id like 'mock_%'
         or thread_id like 'a0000001-0000-4000-8000-%'
         or thread_id like 'b0000001-0000-4000-8000-%'
         or thread_id like '5eebea27-3cb6-4b1c-bf37-efdf253b9b66%'
         or thread_id like 'f3a6a2aa-6eee-4698-ac83-8ec5ade5f2ff%'
         or thread_id like '473bd72d-fba8-4cfd-abbc-7f35e910f141%'
         or thread_id like '9bfa997d-1da5-4e40-8594-b3592b2c5aa2%'
         or thread_id like '6cbffc36-f8d2-431e-96bb-2238a6112c04%'
         or thread_id like '58f3b275-b340-4d23-8982-959eeb517f90%'
    $q$;
  end if;
  if to_regclass('public.chat_thread_hides') is not null then
    execute $q$
      delete from public.chat_thread_hides
      where user_id like 'mock_%'
         or thread_id like 'a0000001-0000-4000-8000-%'
         or thread_id like 'b0000001-0000-4000-8000-%'
         or thread_id like '5eebea27-3cb6-4b1c-bf37-efdf253b9b66%'
         or thread_id like 'f3a6a2aa-6eee-4698-ac83-8ec5ade5f2ff%'
         or thread_id like '473bd72d-fba8-4cfd-abbc-7f35e910f141%'
         or thread_id like '9bfa997d-1da5-4e40-8594-b3592b2c5aa2%'
         or thread_id like '6cbffc36-f8d2-431e-96bb-2238a6112c04%'
         or thread_id like '58f3b275-b340-4d23-8982-959eeb517f90%'
    $q$;
  end if;
  if to_regclass('public.event_favorites') is not null then
    execute $q$
      delete from public.event_favorites
      where user_id like 'mock_%'
         or event_id::text like 'a0000001-0000-4000-8000-%'
         or event_id::text like 'b0000001-0000-4000-8000-%'
         or event_id in (
           '5eebea27-3cb6-4b1c-bf37-efdf253b9b66',
           'f3a6a2aa-6eee-4698-ac83-8ec5ade5f2ff',
           '473bd72d-fba8-4cfd-abbc-7f35e910f141',
           '9bfa997d-1da5-4e40-8594-b3592b2c5aa2',
           '6cbffc36-f8d2-431e-96bb-2238a6112c04',
           '58f3b275-b340-4d23-8982-959eeb517f90'
         )
    $q$;
  end if;
  if to_regclass('public.event_watchlist') is not null then
    execute $q$
      delete from public.event_watchlist
      where user_id like 'mock_%'
         or event_id::text like 'a0000001-0000-4000-8000-%'
         or event_id::text like 'b0000001-0000-4000-8000-%'
    $q$;
  end if;
  if to_regclass('public.event_ticket_sales') is not null then
    execute $q$
      delete from public.event_ticket_sales
      where buyer_id like 'mock_%'
         or host_id like 'mock_%'
         or payment_intent_id like 'demo_%'
         or event_id::text like 'a0000001-0000-4000-8000-%'
         or event_id::text like 'b0000001-0000-4000-8000-%'
         or event_id in (
           '5eebea27-3cb6-4b1c-bf37-efdf253b9b66',
           'f3a6a2aa-6eee-4698-ac83-8ec5ade5f2ff',
           '473bd72d-fba8-4cfd-abbc-7f35e910f141',
           '9bfa997d-1da5-4e40-8594-b3592b2c5aa2',
           '6cbffc36-f8d2-431e-96bb-2238a6112c04',
           '58f3b275-b340-4d23-8982-959eeb517f90'
         )
    $q$;
  end if;
  if to_regclass('public.clubs') is not null then
    execute $q$
      delete from public.clubs where id like 'mock_%'
    $q$;
  end if;
end $$;

delete from public.chat_messages
where sender_id like 'mock_%'
   or event_id::text like 'a0000001-0000-4000-8000-%'
   or event_id::text like 'b0000001-0000-4000-8000-%'
   or event_id in (
     '5eebea27-3cb6-4b1c-bf37-efdf253b9b66',
     'f3a6a2aa-6eee-4698-ac83-8ec5ade5f2ff',
     '473bd72d-fba8-4cfd-abbc-7f35e910f141',
     '9bfa997d-1da5-4e40-8594-b3592b2c5aa2',
     '6cbffc36-f8d2-431e-96bb-2238a6112c04',
     '58f3b275-b340-4d23-8982-959eeb517f90'
   );

-- モック参加者（ストア／QA／SPOTTO FC 付与分）
delete from public.event_participants
where user_id like 'mock_%'
   or event_id::text like 'a0000001-0000-4000-8000-%'
   or event_id::text like 'b0000001-0000-4000-8000-%'
   or event_id in (
     '5eebea27-3cb6-4b1c-bf37-efdf253b9b66',
     'f3a6a2aa-6eee-4698-ac83-8ec5ade5f2ff',
     '473bd72d-fba8-4cfd-abbc-7f35e910f141',
     '9bfa997d-1da5-4e40-8594-b3592b2c5aa2',
     '6cbffc36-f8d2-431e-96bb-2238a6112c04',
     '58f3b275-b340-4d23-8982-959eeb517f90'
   );

delete from public.events
where host_id like 'mock_%'
   or id::text like 'a0000001-0000-4000-8000-%'
   or id::text like 'b0000001-0000-4000-8000-%'
   or title like '[QA]%'
   or title in ('あじぇへ', 'やっほー')
   or id in (
     '5eebea27-3cb6-4b1c-bf37-efdf253b9b66',
     'f3a6a2aa-6eee-4698-ac83-8ec5ade5f2ff',
     '473bd72d-fba8-4cfd-abbc-7f35e910f141',
     '9bfa997d-1da5-4e40-8594-b3592b2c5aa2',
     '6cbffc36-f8d2-431e-96bb-2238a6112c04',
     '58f3b275-b340-4d23-8982-959eeb517f90'
   );

delete from public.profiles where id like 'mock_%';

-- 実イベントの joined_count を実参加者に合わせて再計算
-- （「1000人参加中」表示モック / mock 参加者削除後のズレ）
update public.events e
set
  joined_count = coalesce((
    select sum(greatest(1, coalesce(p.ticket_quantity, 1)))::int
    from public.event_participants p
    where p.event_id = e.id
      and (p.status = 'joined' or p.status is null)
  ), 0),
  updated_at = now()
where e.id in (
  '00a26f65-2ec3-4c2e-968c-ee756d08e079',
  '8b2f5e43-b062-4a1f-a200-eb051780a6ce'
);

commit;

-- 残件確認（すべて 0 ならクリーン）
select 'events_mock' as kind, count(*)::int as n
from public.events
where host_id like 'mock_%'
   or id::text like 'a0000001-%'
   or id::text like 'b0000001-%'
   or title like '[QA]%'
   or title in ('あじぇへ', 'やっほー')
union all
select 'profiles_mock', count(*)::int from public.profiles where id like 'mock_%'
union all
select 'participants_mock', count(*)::int from public.event_participants where user_id like 'mock_%';

select id, title, joined_count, capacity
from public.events
where id in (
  '00a26f65-2ec3-4c2e-968c-ee756d08e079',
  '8b2f5e43-b062-4a1f-a200-eb051780a6ce'
);
