/**
 * 主催者売上 E2E テスト用フラグ（本番ビルドではすべて false）。
 *
 * 詳細手順: supabase/SEED_SALES_QA.md
 *
 * 手順の概要:
 * 1. 主催者アカウントで過去日付の有料イベントを作成（日付ピッカーで昨日など）
 * 2. 別アカウント（参加者）でそのイベントを開き、Stripe テスト決済または __DEV__ デモ決済
 * 3. 主催者の「売上管理」で当月／該当月に金額が載ることを確認
 *
 * 1アカウントのみの場合は売上画面の「テスト売上を記録」も利用可。
 */
export const ALLOW_PAST_EVENT_DATES = typeof __DEV__ !== 'undefined' && __DEV__;
export const ALLOW_JOIN_PAST_EVENTS = typeof __DEV__ !== 'undefined' && __DEV__;
export const ALLOW_HOST_SELF_TEST_SALE =
  typeof __DEV__ !== 'undefined' && __DEV__;

/** 日付ピッカーで遡れる日数（ALLOW_PAST_EVENT_DATES 時） */
export const PAST_EVENT_DATE_LOOKBACK_DAYS = 60;
