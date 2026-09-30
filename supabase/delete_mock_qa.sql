-- =============================================================================
-- QA モック削除のみ（再投入しない）
-- =============================================================================
-- 使い方:
--   1) Supabase Dashboard → SQL Editor で全文 Run
--   2) npm run delete:qa
--
-- 対象: mock_qa_* / タイトル [QA]% / UUID a0000001-0000-4000-8000-%
-- ストアデモ (mock_store_* / b0000001-…) は削除しません
-- =============================================================================

begin;

-- 関連テーブル（存在しない場合はスキップ）
-- chat_thread_reads / chat_thread_hides は event_id ではなく thread_id
-- （形式: "{eventId}:group" / "{eventId}:host:{dmUserId}"）
do $$
begin
  if to_regclass('public.chat_thread_reads') is not null then
    execute $q$
      delete from public.chat_thread_reads
      where thread_id like 'a0000001-0000-4000-8000-%'
         or user_id like 'mock_qa_%'
    $q$;
  end if;
  if to_regclass('public.chat_thread_hides') is not null then
    execute $q$
      delete from public.chat_thread_hides
      where thread_id like 'a0000001-0000-4000-8000-%'
         or user_id like 'mock_qa_%'
    $q$;
  end if;
  if to_regclass('public.event_favorites') is not null then
    execute $q$
      delete from public.event_favorites
      where event_id::text like 'a0000001-0000-4000-8000-%'
         or user_id like 'mock_qa_%'
    $q$;
  end if;
  if to_regclass('public.event_watchlist') is not null then
    execute $q$
      delete from public.event_watchlist
      where event_id::text like 'a0000001-0000-4000-8000-%'
         or user_id like 'mock_qa_%'
    $q$;
  end if;
  if to_regclass('public.event_ticket_sales') is not null then
    execute $q$
      delete from public.event_ticket_sales
      where event_id::text like 'a0000001-0000-4000-8000-%'
         or buyer_id like 'mock_qa_%'
    $q$;
  end if;
  if to_regclass('public.clubs') is not null then
    execute $q$
      delete from public.clubs where id like 'mock_qa_%'
    $q$;
  end if;
end $$;

delete from public.chat_messages
where event_id::text like 'a0000001-0000-4000-8000-%'
   or sender_id like 'mock_qa_%';

delete from public.event_participants
where event_id::text like 'a0000001-0000-4000-8000-%'
   or user_id like 'mock_qa_%';

delete from public.events
where id::text like 'a0000001-0000-4000-8000-%'
   or host_id like 'mock_qa_%'
   or title like '[QA]%';

delete from public.profiles where id like 'mock_qa_%';

commit;

-- 残件確認（0件なら成功）
select count(*) as remaining_qa_events
from public.events
where host_id like 'mock_qa_%' or title like '[QA]%';
