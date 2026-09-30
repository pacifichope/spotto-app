#!/usr/bin/env node
/**
 * QA モックデータ投入スクリプト
 *
 * 使い方:
 *   node scripts/seed-mock-qa.mjs
 *
 * 必要な環境変数（どれか）:
 *   SUPABASE_DB_URL / DATABASE_URL           … Postgres 接続文字列（推奨）
 *   または
 *   EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY                 … SQL を rpc できないため DB URL 推奨
 *
 * 実体は supabase/seed_mock_qa.sql を実行します。
 * Supabase Dashboard の SQL Editor に貼り付けても同じ結果です。
 */

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const sqlPath = join(root, 'supabase', 'seed_mock_qa.sql');

function loadDotEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    for (const line of text.split('\n')) {
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

loadDotEnv();

if (!existsSync(sqlPath)) {
  console.error('missing', sqlPath);
  process.exit(1);
}

const dbUrl =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  '';

if (!dbUrl) {
  console.log(`
seed-mock-qa: DATABASE_URL が未設定です。

次のいずれかで投入してください:

1) Supabase Dashboard → SQL Editor
   ファイル: supabase/seed_mock_qa.sql を全文貼り付けて Run

2) 接続文字列を渡して再実行
   SUPABASE_DB_URL='postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres' \\
     node scripts/seed-mock-qa.mjs

3) ローカル psql
   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed_mock_qa.sql
`);
  process.exit(2);
}

const psql = spawnSync(
  'psql',
  [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', sqlPath],
  { stdio: 'inherit', env: process.env },
);

if (psql.error) {
  console.error('psql の実行に失敗しました:', psql.error.message);
  console.error('psql が入っていない場合は SQL Editor で seed_mock_qa.sql を実行してください。');
  process.exit(1);
}

process.exit(psql.status ?? 1);
