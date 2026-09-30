#!/usr/bin/env node
/**
 * QA モック削除スクリプト（再投入しない）
 *
 * 使い方:
 *   npm run delete:qa
 *
 * 接続文字列（優先順）:
 *   SUPABASE_DB_URL / DATABASE_URL / POSTGRES_URL
 *   なければ supabase/.temp/pooler-url
 *
 * 実体: supabase/delete_mock_qa.sql
 */

import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const sqlPath = join(root, 'supabase', 'delete_mock_qa.sql');

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

function readPoolerUrl() {
  const p = join(root, 'supabase', '.temp', 'pooler-url');
  if (!existsSync(p)) return '';
  return readFileSync(p, 'utf8').trim();
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
  readPoolerUrl();

if (!dbUrl) {
  console.log(`
delete-mock-qa: DATABASE_URL が未設定です。

Supabase Dashboard → SQL Editor で次を実行してください:
  supabase/delete_mock_qa.sql
`);
  process.exit(2);
}

const sql = readFileSync(sqlPath, 'utf8');

// Prefer node + pg (psql may be missing)
async function runWithPg() {
  const { default: pg } = await import('pg');
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    const { rows } = await client.query(
      `select count(*)::int as remaining_qa_events
       from public.events
       where host_id like 'mock_qa_%' or title like '[QA]%'`,
    );
    console.log('QA events remaining:', rows[0]?.remaining_qa_events ?? '?');
  } finally {
    await client.end();
  }
}

async function ensurePgAndRun() {
  try {
    await import('pg');
  } catch {
    console.log('Installing pg temporarily…');
    const install = spawnSync(
      'npm',
      ['install', 'pg@8.13.1', '--no-save', '--no-package-lock'],
      { cwd: root, stdio: 'inherit', env: process.env },
    );
    if (install.status !== 0) {
      throw new Error('npm install pg failed');
    }
  }
  await runWithPg();
}

ensurePgAndRun().catch((err) => {
  console.error(err.message || err);
  // Fallback: write SQL hint
  const hint = join(tmpdir(), 'delete_mock_qa_hint.txt');
  try {
    writeFileSync(hint, sqlPath);
  } catch {
    /* ignore */
  }
  console.error(
    '自動実行に失敗しました。Supabase SQL Editor で delete_mock_qa.sql を実行してください。',
  );
  process.exit(1);
});
