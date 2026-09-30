#!/usr/bin/env node
/**
 * モック / テストデータの一括クリーンアップ
 *
 * 1) Supabase: mock_* / ストアデモ / QA / 捨て打ちイベント を削除
 * 2) Stripe Test mode: 未完了 PI を cancel、成功 PI を refund（テストのみ）
 * 3) Stripe Live mode: 未完了 PI のみ cancel（成功決済は触らない）
 *
 * 使い方:
 *   npm run cleanup:mock
 *   STRIPE_TEST_SECRET_KEY=sk_test_... npm run cleanup:mock
 *   SKIP_STRIPE=1 npm run cleanup:mock
 */

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const sqlPath = join(root, 'supabase', 'cleanup_mock_and_test_data.sql');
const REF = 'gcannfzalogpgxtowapq';

function loadDotEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] == null) process.env[key] = val;
    }
  }
}

function supabaseCliToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  const r = spawnSync(
    'security',
    ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'],
    { encoding: 'utf8' },
  );
  if (r.status === 0) return String(r.stdout || '').trim();
  return '';
}

async function runSqlViaManagementApi(sql) {
  const token = supabaseCliToken();
  if (!token) {
    throw new Error(
      'Supabase CLI token がありません。`supabase login` するか SUPABASE_ACCESS_TOKEN を設定してください。',
    );
  }
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(
      `Management API ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`,
    );
  }
  return json;
}

async function stripeRequest(secret, method, path, params) {
  const url = new URL(`https://api.stripe.com/v1/${path}`);
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  };
  if (params) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(params).toString();
  }
  const res = await fetch(url, init);
  const json = await res.json();
  if (json.error) {
    const err = new Error(json.error.message || 'Stripe error');
    err.code = json.error.code;
    err.raw = json.error;
    throw err;
  }
  return json;
}

async function listAllPaymentIntents(secret, { maxPages = 20 } = {}) {
  const out = [];
  let startingAfter = '';
  for (let page = 0; page < maxPages; page += 1) {
    const q = startingAfter
      ? `payment_intents?limit=100&starting_after=${startingAfter}`
      : 'payment_intents?limit=100';
    const batch = await stripeRequest(secret, 'GET', q);
    const data = batch.data || [];
    out.push(...data);
    if (!batch.has_more || data.length === 0) break;
    startingAfter = data[data.length - 1].id;
  }
  return out;
}

function isMockRelatedPi(pi) {
  const eventId = String(pi?.metadata?.eventId || '');
  if (!eventId) return false;
  if (eventId === 'test' || eventId.startsWith('demo')) return true;
  if (eventId.startsWith('a0000001-') || eventId.startsWith('b0000001-')) {
    return true;
  }
  // 捨て打ちイベント
  const junk = new Set([
    '5eebea27-3cb6-4b1c-bf37-efdf253b9b66',
    'f3a6a2aa-6eee-4698-ac83-8ec5ade5f2ff',
    '473bd72d-fba8-4cfd-abbc-7f35e910f141',
    '9bfa997d-1da5-4e40-8594-b3592b2c5aa2',
    '6cbffc36-f8d2-431e-96bb-2238a6112c04',
    '58f3b275-b340-4d23-8982-959eeb517f90',
  ]);
  return junk.has(eventId);
}

async function cleanupStripeMode(secret, { mode, refundSucceeded }) {
  console.log(`\n› Stripe ${mode}: scanning payment_intents…`);
  const intents = await listAllPaymentIntents(secret);
  console.log(`  found ${intents.length}`);

  let cancelled = 0;
  let refunded = 0;
  let skipped = 0;
  let failed = 0;

  for (const pi of intents) {
    const status = pi.status;
    const mockRelated = isMockRelatedPi(pi);
    // Test mode: clean everything unfinished + refund mock-related succeeded
    // Live mode: only cancel unfinished; never refund succeeded unless mock-related AND --refund-live
    try {
      if (
        status === 'requires_payment_method' ||
        status === 'requires_confirmation' ||
        status === 'requires_action' ||
        status === 'requires_capture'
      ) {
        await stripeRequest(secret, 'POST', `payment_intents/${pi.id}/cancel`);
        cancelled += 1;
        console.log(`  cancel ${pi.id} (${status}) eventId=${pi.metadata?.eventId || '-'}`);
        continue;
      }

      if (status === 'succeeded' && refundSucceeded && (mode === 'test' || mockRelated)) {
        // Avoid double-refund
        if (pi.amount_received > 0 && !pi.charges?.data?.[0]?.refunded) {
          await stripeRequest(secret, 'POST', 'refunds', {
            payment_intent: pi.id,
          });
          refunded += 1;
          console.log(
            `  refund ${pi.id} ¥${pi.amount} eventId=${pi.metadata?.eventId || '-'}`,
          );
        } else {
          skipped += 1;
        }
        continue;
      }

      skipped += 1;
    } catch (err) {
      failed += 1;
      console.warn(`  fail ${pi.id}: ${err.message || err}`);
    }
  }

  console.log(
    `  done: cancelled=${cancelled} refunded=${refunded} skipped=${skipped} failed=${failed}`,
  );
  return { cancelled, refunded, skipped, failed, total: intents.length };
}

loadDotEnv();

if (!existsSync(sqlPath)) {
  console.error('missing', sqlPath);
  process.exit(1);
}

const sql = readFileSync(sqlPath, 'utf8');

async function main() {
  console.log('=== 1) Supabase mock / test data cleanup ===');
  const result = await runSqlViaManagementApi(sql);
  console.log(JSON.stringify(result, null, 2));

  if (process.env.SKIP_STRIPE === '1') {
    console.log('\nSKIP_STRIPE=1 — Stripe はスキップしました。');
    return;
  }

  console.log('\n=== 2) Stripe cleanup ===');
  const liveOrCurrent =
    process.env.STRIPE_SECRET_KEY_LIVE ||
    (process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')
      ? process.env.STRIPE_SECRET_KEY
      : '');
  const testKey =
    process.env.STRIPE_SECRET_KEY_TEST ||
    process.env.STRIPE_TEST_SECRET_KEY ||
    (process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')
      ? process.env.STRIPE_SECRET_KEY
      : '');

  if (testKey) {
    await cleanupStripeMode(testKey, { mode: 'test', refundSucceeded: true });
  } else {
    console.warn(
      'STRIPE_SECRET_KEY_TEST 未設定のため Test mode のクリーンアップをスキップ。',
    );
  }

  if (liveOrCurrent.startsWith('sk_live_')) {
    const refundLive = process.env.REFUND_LIVE_MOCK === '1';
    await cleanupStripeMode(liveOrCurrent, {
      mode: 'live',
      refundSucceeded: refundLive,
    });
    if (!refundLive) {
      console.log(
        '  (Live の成功決済は返金していません。モック関連のみ返金する場合は REFUND_LIVE_MOCK=1)',
      );
    }
  } else if (!liveOrCurrent && !testKey) {
    console.warn('STRIPE_SECRET_KEY_TEST / STRIPE_SECRET_KEY_LIVE 未設定');
  }

  console.log('\nクリーンアップ完了');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
