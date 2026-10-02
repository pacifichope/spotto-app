-- =============================================================================
-- public.events: タイトル / 説明の日英翻訳カラム
-- =============================================================================

alter table public.events
  add column if not exists source_lang text
    check (source_lang is null or source_lang in ('ja', 'en')),
  add column if not exists title_ja text,
  add column if not exists title_en text,
  add column if not exists description_ja text,
  add column if not exists description_en text,
  add column if not exists translated_at timestamptz;

comment on column public.events.source_lang is '作成時の原文言語（ja / en）';
comment on column public.events.title_ja is '表示用タイトル（日本語）';
comment on column public.events.title_en is '表示用タイトル（英語）';
comment on column public.events.description_ja is '表示用説明（日本語）';
comment on column public.events.description_en is '表示用説明（英語）';
comment on column public.events.translated_at is '自動翻訳完了日時';
