import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createLineCustomToken,
  deleteFirebaseUser,
  ensureAuthenticatedRole,
  getFirebaseAdmin,
  getFirebaseAdminInitError,
  verifyFirebaseIdToken,
} from './firebaseAdmin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(ROOT, '.env'));
loadEnvFile(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 8787);
/** 実機・シミュレータから届くよう全インターフェースで待受（既定は localhost のみになりがち） */
const HOST = (process.env.HOST || '0.0.0.0').trim() || '0.0.0.0';
const CORS_ORIGIN = (process.env.CORS_ORIGIN || '*').trim();

function env(name) {
  return (process.env[name] || '').trim();
}

/** test | live。未設定・不正値は安全側で test。アプリと同じ EXPO_PUBLIC_STRIPE_MODE を優先 */
function stripeMode() {
  const raw = (
    env('EXPO_PUBLIC_STRIPE_MODE') ||
    env('STRIPE_MODE') ||
    'test'
  ).toLowerCase();
  return raw === 'live' ? 'live' : 'test';
}

/** モードに応じた Secret Key（*_LIVE / *_TEST → 互換 STRIPE_SECRET_KEY） */
function stripeSecretKey() {
  const mode = stripeMode();
  const specific =
    mode === 'live' ? env('STRIPE_SECRET_KEY_LIVE') : env('STRIPE_SECRET_KEY_TEST');
  if (specific) return specific;
  return env('STRIPE_SECRET_KEY');
}

/** モードに応じた Publishable Key（アプリ側と揃える用・ヘルスチェック） */
function stripePublishableKeyFromEnv() {
  const mode = stripeMode();
  const specific =
    mode === 'live'
      ? env('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE')
      : env('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST');
  if (specific) return specific;
  return env('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY');
}

/** sk_test_51Xxx… / pk_test_51Xxx… からアカウント ID とモードを推定 */
function stripeKeyMeta(key) {
  const raw = String(key || '').trim();
  const match = raw.match(/^(sk|pk)_(test|live)_(51[A-Za-z0-9]+)/);
  if (!match) {
    return { kind: '', mode: '', accountId: '', fingerprint: '', bodyPrefix: '' };
  }
  const kind = match[1];
  const mode = match[2];
  const body = match[3];
  // Standard keys share `51` + accountSuffix(15) before diverging into key-specific entropy
  // e.g. 51Sw0pFBT0hPMfANt… → acct_1Sw0pFBT0hPMfANt
  let accountId = '';
  if (body.length >= 17) {
    accountId = `acct_1${body.slice(2, 17)}`;
  }
  return {
    kind,
    mode,
    accountId,
    bodyPrefix: body.slice(0, 17),
    fingerprint: `${kind}_${mode}_${body.slice(0, 12)}…`,
  };
}

let cachedStripeAccount = null;
let cachedStripeAccountSecretFp = '';

async function resolveStripeAccount(force = false) {
  const secret = stripeSecretKey();
  const secretFp = stripeKeyMeta(secret).fingerprint || secret.slice(0, 12);
  if (
    cachedStripeAccount &&
    !force &&
    cachedStripeAccountSecretFp === secretFp
  ) {
    return cachedStripeAccount;
  }
  if (!secret) {
    cachedStripeAccount = {
      ok: false,
      error: 'STRIPE_SECRET_KEY(_TEST/_LIVE) is not set',
    };
    cachedStripeAccountSecretFp = '';
    return cachedStripeAccount;
  }
  try {
    const response = await fetch('https://api.stripe.com/v1/account', {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const data = await response.json();
    if (!response.ok) {
      cachedStripeAccount = {
        ok: false,
        error: data?.error?.message || `HTTP ${response.status}`,
        keyMeta: stripeKeyMeta(secret),
        mode: stripeMode(),
      };
      cachedStripeAccountSecretFp = secretFp;
      return cachedStripeAccount;
    }
    cachedStripeAccount = {
      ok: true,
      id: data.id || '',
      email: data.email || '',
      country: data.country || '',
      chargesEnabled: Boolean(data.charges_enabled),
      livemode:
        data.livemode != null
          ? Boolean(data.livemode)
          : stripeKeyMeta(secret).mode === 'live',
      keyMeta: stripeKeyMeta(secret),
      mode: stripeMode(),
    };
    cachedStripeAccountSecretFp = secretFp;
    return cachedStripeAccount;
  } catch (err) {
    cachedStripeAccount = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      keyMeta: stripeKeyMeta(secret),
      mode: stripeMode(),
    };
    cachedStripeAccountSecretFp = secretFp;
    return cachedStripeAccount;
  }
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cron-Secret',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(payload);
}

function formBody(params) {
  return Object.entries(params)
    .filter(([, value]) => value != null && value !== '')
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join('&');
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) {
      throw new Error('payload too large');
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

/** lib/events.ts の refundHoursBeforeStart と同じ規則 */
function refundHoursBeforeStart(policy) {
  const text = String(policy || '').trim();
  if (!text) return 48;
  if (text.includes('返金不可')) return null;
  const dayMatch = text.match(/(\d+)\s*日前/);
  if (dayMatch) return Number(dayMatch[1]) * 24;
  const hourMatch = text.match(/(\d+)\s*時間前/);
  if (hourMatch) return Number(hourMatch[1]);
  return 48;
}

function refundAmountForPolicy({ cancelPolicy, eventStartsAt, paidYen, now = new Date() }) {
  const paid = Math.max(0, Math.floor(Number(paidYen) || 0));
  if (paid <= 0) return 0;
  const hours = refundHoursBeforeStart(cancelPolicy);
  if (hours == null) return 0;
  const start = Date.parse(String(eventStartsAt || ''));
  if (!Number.isFinite(start)) return paid;
  const cutoff = start - hours * 60 * 60 * 1000;
  return now.getTime() >= cutoff ? 0 : paid;
}

function stripeNetworkError(err) {
  const cause = err?.cause;
  const code = cause?.code || err?.code || '';
  const detail =
    cause?.message ||
    (err instanceof Error ? err.message : String(err || 'unknown'));
  const hint =
    code === 'ENOTFOUND' || code === 'EAI_AGAIN'
      ? '（DNS 解決失敗。ネットワーク制限やオフラインの可能性）'
      : code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ECONNRESET'
        ? '（Stripe への接続失敗。ファイアウォール / プロキシを確認）'
        : '';
  const error = new Error(
    `Stripe API に接続できません: ${code ? `${code} ` : ''}${detail}${hint}`,
  );
  error.status = 502;
  error.cause = cause || err;
  return error;
}

async function stripeForm(pathname, params) {
  const secret = stripeSecretKey();
  if (!secret) {
    const error = new Error(
      `STRIPE_SECRET_KEY_${stripeMode().toUpperCase()} (or STRIPE_SECRET_KEY) is not set`,
    );
    error.status = 503;
    throw error;
  }
  let response;
  try {
    response = await fetch(`https://api.stripe.com/v1/${pathname}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody(params),
    });
  } catch (err) {
    console.error('[api] stripeForm network error', pathname, {
      message: err instanceof Error ? err.message : String(err),
      code: err?.cause?.code || err?.code,
      cause: err?.cause?.message,
    });
    throw stripeNetworkError(err);
  }
  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || 'Stripe API error';
    console.warn('[api] stripeForm API error', pathname, response.status, message);
    const error = new Error(message);
    error.status = 502;
    throw error;
  }
  return data;
}

async function stripeGet(pathname) {
  const secret = stripeSecretKey();
  if (!secret) {
    const error = new Error(
      `STRIPE_SECRET_KEY_${stripeMode().toUpperCase()} (or STRIPE_SECRET_KEY) is not set`,
    );
    error.status = 503;
    throw error;
  }
  let response;
  try {
    response = await fetch(`https://api.stripe.com/v1/${pathname}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secret}`,
      },
    });
  } catch (err) {
    console.error('[api] stripeGet network error', pathname, {
      message: err instanceof Error ? err.message : String(err),
      code: err?.cause?.code || err?.code,
      cause: err?.cause?.message,
    });
    throw stripeNetworkError(err);
  }
  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || 'Stripe API error';
    console.warn('[api] stripeGet API error', pathname, response.status, message);
    const error = new Error(message);
    error.status = 502;
    throw error;
  }
  return data;
}

function isValidEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isUsableSecret(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (raw.startsWith('YOUR_')) return false;
  // プレースホルダ（re_xxxxx など）は未設定扱い
  if (/x{3,}/i.test(raw) && !/^re_[A-Za-z0-9]{20,}$/.test(raw)) return false;
  if (/^(re_|SG\.)?x+$/i.test(raw)) return false;
  return true;
}

function mailFromAddress() {
  return (
    env('RESEND_FROM_EMAIL') ||
    env('SENDGRID_FROM_EMAIL') ||
    env('MAIL_FROM_EMAIL') ||
    ''
  );
}

function mailFromName() {
  return (
    env('RESEND_FROM_NAME') ||
    env('SENDGRID_FROM_NAME') ||
    env('MAIL_FROM_NAME') ||
    'spotto'
  );
}

/** お問い合わせ宛先は常に support@spotto.fun（Cloudflare Email Routing） */
function contactInboxAddress() {
  return 'support@spotto.fun';
}

async function sendResend({ to, toName, subject, text, html, replyTo }) {
  const apiKey = env('RESEND_API_KEY');
  const from = mailFromAddress();
  if (!isUsableSecret(apiKey) || !from) return { skipped: true, provider: 'resend' };
  if (!to || !isValidEmailAddress(to) || to.endsWith('@users.spotto.local')) {
    return { skipped: true, provider: 'resend' };
  }
  const fromHeader = `${mailFromName()} <${from}>`;
  const payload = {
    from: fromHeader,
    to: [toName ? `${toName} <${to}>` : to],
    subject,
    text,
    html: html || `<p>${String(text).replace(/\n/g, '<br/>')}</p>`,
  };
  if (replyTo && isValidEmailAddress(replyTo)) {
    payload.reply_to = replyTo;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend ${response.status}: ${detail.slice(0, 240)}`);
  }
  const data = await response.json().catch(() => ({}));
  return { skipped: false, provider: 'resend', id: data?.id || '' };
}

async function sendSendGrid({ to, toName, subject, text, html, replyTo }) {
  const apiKey = env('SENDGRID_API_KEY');
  const from = mailFromAddress();
  if (!isUsableSecret(apiKey) || !from) {
    return { skipped: true, provider: 'sendgrid' };
  }
  if (!to || !isValidEmailAddress(to) || to.endsWith('@users.spotto.local')) {
    return { skipped: true, provider: 'sendgrid' };
  }
  const body = {
    personalizations: [
      {
        to: [{ email: to, name: toName || undefined }],
      },
    ],
    from: { email: from, name: mailFromName() },
    subject,
    content: [
      { type: 'text/plain', value: text },
      {
        type: 'text/html',
        value: html || `<p>${String(text).replace(/\n/g, '<br/>')}</p>`,
      },
    ],
  };
  if (replyTo && isValidEmailAddress(replyTo)) {
    body.reply_to = { email: replyTo };
  }
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok && response.status !== 202) {
    const detail = await response.text();
    throw new Error(`SendGrid ${response.status}: ${detail.slice(0, 200)}`);
  }
  return { skipped: false, provider: 'sendgrid' };
}

/**
 * Resend → SendGrid の順で送信。
 * どちらも未設定なら skipped（お問い合わせは 503 にして mailto へフォールバック）。
 */
async function sendMail(options) {
  if (isUsableSecret(env('RESEND_API_KEY'))) {
    const result = await sendResend(options);
    if (!result.skipped) return result;
  }
  if (isUsableSecret(env('SENDGRID_API_KEY'))) {
    const result = await sendSendGrid(options);
    if (!result.skipped) return result;
  }
  console.info('[mail:console]', {
    to: options.to,
    subject: options.subject,
    text: options.text,
  });
  return { skipped: true, provider: 'none' };
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readBookings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBookings(bookings) {
  ensureDataDir();
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

function upsertBooking(payload) {
  if (!payload?.eventId || !payload?.toEmail) return;
  const bookings = readBookings().filter(
    (item) =>
      !(item.eventId === payload.eventId && item.toEmail === payload.toEmail),
  );
  bookings.push({
    eventId: payload.eventId,
    eventTitle: payload.eventTitle,
    toEmail: payload.toEmail,
    toName: payload.toName,
    location: payload.location,
    scheduleLabel: payload.scheduleLabel,
    startsAt: payload.startsAt,
    createdAt: new Date().toISOString(),
    reminderSentAt: null,
    paymentIntentId: payload.paymentIntentId || '',
    amountYen: Math.max(0, Math.floor(Number(payload.amountYen) || 0)),
  });
  writeBookings(bookings);
}

function removeBooking(eventId, toEmail) {
  writeBookings(
    readBookings().filter(
      (item) => !(item.eventId === eventId && item.toEmail === toEmail),
    ),
  );
}

function mailCopy(kind, payload) {
  const title = payload.eventTitle || 'イベント';
  const when = payload.scheduleLabel || payload.startsAt || '';
  const where = payload.location || '';
  const amount =
    Number(payload.amountYen) > 0
      ? `${Number(payload.amountYen).toLocaleString('ja-JP')}円`
      : '無料';
  if (kind === 'booking_confirmed') {
    return {
      subject: `【spotto】予約が完了しました: ${title}`,
      text: [
        `${payload.toName || '参加者'} さん`,
        '',
        `「${title}」への参加が確定しました。`,
        when ? `日時: ${when}` : '',
        where ? `場所: ${where}` : '',
        `参加費: ${amount}`,
        '',
        '当日はアプリのチェックインとグループチャットをご利用ください。',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }
  if (kind === 'booking_cancelled') {
    const refund = Math.max(0, Math.floor(Number(payload.refundYen) || 0));
    const refundLine =
      refund > 0
        ? `キャンセルポリシーに基づき ${refund.toLocaleString('ja-JP')}円を返金します。`
        : 'キャンセルポリシーの期限外のため、参加費の返金はありません。';
    return {
      subject: `【spotto】予約をキャンセルしました: ${title}`,
      text: [
        `${payload.toName || '参加者'} さん`,
        '',
        `「${title}」の予約をキャンセルしました。`,
        refundLine,
      ].join('\n'),
    };
  }
  if (kind === 'event_cancelled_by_host') {
    const refund = Math.max(0, Math.floor(Number(payload.refundYen) || 0));
    const refundLine =
      refund > 0
        ? `主催者都合のため、参加費 ${refund.toLocaleString('ja-JP')}円を全額返金します。`
        : '主催者の都合により中止となりました。';
    return {
      subject: `【spotto】イベントが中止になりました: ${title}`,
      text: [
        `${payload.toName || '参加者'} さん`,
        '',
        `主催者により「${title}」が中止になりました。`,
        when ? `日時: ${when}` : '',
        refundLine,
        '',
        'ご不便をおかけして申し訳ありません。',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }
  return {
    subject: `【spotto】まもなく開催: ${title}`,
    text: [
      `${payload.toName || '参加者'} さん`,
      '',
      `「${title}」の開催が近づいています。`,
      when ? `日時: ${when}` : '',
      where ? `場所: ${where}` : '',
      '',
      '当日はアプリから集合場所とチャットをご確認ください。',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

async function handlePayments(body) {
  const amountYen = Math.max(0, Math.floor(Number(body.amountYen) || 0));
  if (amountYen <= 0) {
    const error = new Error('amountYen must be positive');
    error.status = 400;
    throw error;
  }
  const title = String(body.title || 'スポーツイベント').slice(0, 120);
  const eventId = String(body.eventId || '');
  const returnUrl = String(body.returnUrl || 'spotto://payment-complete');
  const preferHosted = Boolean(body.preferHostedCheckout);
  const join = returnUrl.includes('?') ? '&' : '?';
  const account = await resolveStripeAccount();

  if (preferHosted) {
    const session = await stripeForm('checkout/sessions', {
      mode: 'payment',
      success_url: `${returnUrl}${join}status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}${join}status=cancel`,
      'line_items[0][quantity]': 1,
      'line_items[0][price_data][currency]': 'jpy',
      'line_items[0][price_data][unit_amount]': amountYen,
      'line_items[0][price_data][product_data][name]': title,
      'payment_intent_data[metadata][eventId]': eventId,
      'metadata[eventId]': eventId,
    });
    console.log('[api] checkout.session created', {
      id: session.id,
      livemode: session.livemode,
      paymentStatus: session.payment_status,
      accountId: account.ok ? account.id : account.error,
      dashboardHint: session.livemode
        ? 'https://dashboard.stripe.com/payments'
        : 'https://dashboard.stripe.com/test/payments',
    });
    return {
      checkoutUrl: session.url,
      checkoutSessionId: session.id,
      paymentIntentId:
        typeof session.payment_intent === 'string' ? session.payment_intent : '',
      livemode: Boolean(session.livemode),
      stripeAccountId: account.ok ? account.id : '',
      status: session.status || '',
    };
  }

  const intent = await stripeForm('payment_intents', {
    amount: amountYen,
    currency: 'jpy',
    'automatic_payment_methods[enabled]': 'true',
    'metadata[eventId]': eventId,
    description: title,
  });
  console.log('[api] payment_intent created', {
    id: intent.id,
    status: intent.status,
    amount: intent.amount,
    currency: intent.currency,
    livemode: intent.livemode,
    accountId: account.ok ? account.id : account.error,
    keyFingerprint: account.keyMeta?.fingerprint || stripeKeyMeta(stripeSecretKey()).fingerprint,
    dashboardUrl: intent.livemode
      ? `https://dashboard.stripe.com/payments/${intent.id}`
      : `https://dashboard.stripe.com/test/payments/${intent.id}`,
  });
  return {
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    livemode: Boolean(intent.livemode),
    stripeAccountId: account.ok ? account.id : '',
    status: intent.status || '',
  };
}

async function handlePaymentIntentStatus(body) {
  const paymentIntentId = String(body.paymentIntentId || '').trim();
  if (!paymentIntentId) {
    const error = new Error('paymentIntentId is required');
    error.status = 400;
    throw error;
  }
  if (paymentIntentId.startsWith('demo_')) {
    return {
      paymentIntentId,
      status: 'succeeded',
      paid: true,
      demo: true,
      livemode: false,
      stripeAccountId: '',
    };
  }
  const intent = await stripeGet(
    `payment_intents/${encodeURIComponent(paymentIntentId)}`,
  );
  const paid = intent.status === 'succeeded';
  const account = await resolveStripeAccount();
  console.log('[api] payment_intent status', {
    id: intent.id,
    status: intent.status,
    amount: intent.amount,
    livemode: intent.livemode,
    accountId: account.ok ? account.id : account.error,
  });
  return {
    paymentIntentId: intent.id,
    status: intent.status,
    paid,
    amountYen: Math.max(0, Math.floor(Number(intent.amount) || 0)),
    livemode: Boolean(intent.livemode),
    stripeAccountId: account.ok ? account.id : '',
    demo: false,
  };
}

async function handlePaymentConfirm(body) {
  const sessionId = String(
    body.sessionId || body.checkoutSessionId || '',
  ).trim();
  if (!sessionId) {
    const error = new Error('sessionId is required');
    error.status = 400;
    throw error;
  }
  const session = await stripeGet(
    `checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent`,
  );
  const paid =
    session.payment_status === 'paid' || session.status === 'complete';
  const intent = session.payment_intent;
  const paymentIntentId =
    typeof intent === 'string'
      ? intent
      : intent && typeof intent.id === 'string'
        ? intent.id
        : '';
  return {
    paid,
    paymentIntentId,
    amountYen: Math.max(0, Math.floor(Number(session.amount_total) || 0)),
    status: session.status,
    paymentStatus: session.payment_status,
  };
}

async function handleRefunds(body) {
  const paymentIntentId = String(body.paymentIntentId || '');
  if (!paymentIntentId || paymentIntentId.startsWith('demo_')) {
    await applySaleRefundViaServiceRole({
      eventId: body.eventId,
      paymentIntentId,
      refundYen: Math.max(
        0,
        Math.floor(Number(body.refundAmountYen ?? body.amountYen) || 0),
      ),
      fullRefund: Boolean(body.hostCancelled),
    });
    return { refundId: `demo_re_${Date.now()}`, demo: true };
  }
  const paidYen = Math.max(0, Math.floor(Number(body.amountYen) || 0));
  const requested = Math.max(
    0,
    Math.floor(Number(body.refundAmountYen ?? paidYen) || 0),
  );
  const allowed = body.hostCancelled
    ? paidYen
    : refundAmountForPolicy({
        cancelPolicy: body.cancelPolicy,
        eventStartsAt: body.eventStartsAt,
        paidYen,
      });
  const refundYen = Math.min(requested, allowed);
  if (refundYen <= 0) {
    const error = new Error('キャンセルポリシーの期限外のため返金できません');
    error.status = 400;
    throw error;
  }
  const refund = await stripeForm('refunds', {
    payment_intent: paymentIntentId,
    amount: refundYen,
    reason: 'requested_by_customer',
    'metadata[eventId]': String(body.eventId || ''),
  });

  await applySaleRefundViaServiceRole({
    eventId: body.eventId,
    paymentIntentId,
    refundYen,
    fullRefund: Boolean(body.hostCancelled),
  });

  return { refundId: refund.id, refundAmountYen: refundYen, demo: false };
}

/** 返金成功後に売上台帳を相殺（service role） */
async function applySaleRefundViaServiceRole({
  eventId,
  paymentIntentId,
  refundYen,
  fullRefund,
}) {
  const supabaseUrl = supabaseBaseUrl();
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey || !eventId) return;

  const amount = Math.max(0, Math.floor(Number(refundYen) || 0));
  if (amount <= 0 && !fullRefund) return;

  try {
    let query =
      `${supabaseUrl}/rest/v1/event_ticket_sales?event_id=eq.${encodeURIComponent(String(eventId))}` +
      `&status=eq.paid`;
    if (paymentIntentId && !String(paymentIntentId).startsWith('demo_')) {
      query += `&payment_intent_id=eq.${encodeURIComponent(String(paymentIntentId))}`;
    }

    const listRes = await fetch(`${query}&select=id,amount_yen,refunded_yen`, {
      headers: serviceRoleHeaders(),
    });
    const rows = await listRes.json().catch(() => []);
    if (!listRes.ok || !Array.isArray(rows) || rows.length === 0) return;

    const nowIso = new Date().toISOString();
    for (const row of rows) {
      const current = Math.max(0, Math.floor(Number(row.amount_yen) || 0));
      const prevRefunded = Math.max(0, Math.floor(Number(row.refunded_yen) || 0));
      const cut = fullRefund ? current : Math.min(amount, current);
      if (cut <= 0) continue;
      const payload =
        cut >= current
          ? {
              status: 'refunded',
              refunded_at: nowIso,
              refunded_yen: prevRefunded + current,
            }
          : {
              amount_yen: current - cut,
              refunded_yen: prevRefunded + cut,
            };
      await fetch(
        `${supabaseUrl}/rest/v1/event_ticket_sales?id=eq.${encodeURIComponent(row.id)}`,
        {
          method: 'PATCH',
          headers: {
            ...serviceRoleHeaders(),
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(payload),
        },
      );
    }
  } catch (error) {
    console.warn('[sales] service-role refund offset failed', error);
  }
}

async function handleNotify(body) {
  const kind = body.kind || 'booking_confirmed';

  if (kind === 'event_cancelled_by_host') {
    const bookings = readBookings().filter(
      (item) => item.eventId === body.eventId,
    );
    let emailed = 0;
    let refunded = 0;
    const copy = mailCopy(kind, body);
    const targets =
      bookings.length > 0
        ? bookings
        : body.toEmail
          ? [
              {
                toEmail: body.toEmail,
                toName: body.toName,
                paymentIntentId: body.paymentIntentId,
                amountYen: body.amountYen,
              },
            ]
          : [];
    for (const booking of targets) {
      await sendMail({
        to: booking.toEmail,
        toName: booking.toName,
        subject: copy.subject,
        text: mailCopy(kind, {
          ...body,
          toName: booking.toName,
          refundYen: booking.amountYen || body.refundYen,
        }).text,
      });
      emailed += 1;
      const pi = String(booking.paymentIntentId || '');
      if (pi && !pi.startsWith('demo_') && stripeSecretKey()) {
        try {
          await stripeForm('refunds', {
            payment_intent: pi,
            reason: 'requested_by_customer',
            'metadata[eventId]': String(body.eventId || ''),
            'metadata[hostCancelled]': 'true',
          });
          refunded += 1;
        } catch (error) {
          console.warn('[api] host-cancel refund failed', pi, error);
        }
      }
    }
    writeBookings(
      readBookings().filter((item) => item.eventId !== body.eventId),
    );
    await applySaleRefundViaServiceRole({
      eventId: body.eventId,
      paymentIntentId: '',
      refundYen: 0,
      fullRefund: true,
    });
    return { ok: true, emailed, refunded };
  }

  const copy = mailCopy(kind, body);
  const result = await sendMail({
    to: body.toEmail,
    toName: body.toName,
    subject: copy.subject,
    text: copy.text,
  });
  if (kind === 'booking_confirmed') upsertBooking(body);
  if (kind === 'booking_cancelled') {
    removeBooking(body.eventId, body.toEmail);
  }
  return { ok: true, ...result };
}

/**
 * Expo Push 送信。service role で device_push_tokens を解決して Expo へ転送。
 * body: { userIds: string[], title, body, data? }
 */
async function handlePush(body) {
  const userIds = Array.isArray(body?.userIds)
    ? [...new Set(body.userIds.map((id) => String(id || '').trim()).filter(Boolean))]
    : [];
  const title = String(body?.title || 'spotto').slice(0, 80);
  const message = String(body?.body || '').slice(0, 180);
  const data =
    body?.data && typeof body.data === 'object' && !Array.isArray(body.data)
      ? body.data
      : {};

  if (userIds.length === 0) {
    return { ok: true, sent: 0, skipped: true };
  }

  const supabaseUrl = env('EXPO_PUBLIC_SUPABASE_URL').replace(/\/+$/, '').replace(
    /\/auth\/v1$/i,
    '',
  );
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.info('[push:console]', { userIds, title, body: message, data });
    return { ok: true, sent: 0, skipped: true, reason: 'supabase not configured' };
  }

  const inList = userIds.map((id) => `"${id}"`).join(',');
  const tokensRes = await fetch(
    `${supabaseUrl}/rest/v1/device_push_tokens?user_id=in.(${inList})&select=token`,
    {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    },
  );
  const tokenRows = await tokensRes.json().catch(() => []);
  const tokens = Array.isArray(tokenRows)
    ? [
        ...new Set(
          tokenRows
            .map((row) => String(row?.token || '').trim())
            .filter(Boolean),
        ),
      ]
    : [];

  if (tokens.length === 0) {
    return { ok: true, sent: 0 };
  }

  const payload = tokens.map((to) => ({
    to,
    sound: 'default',
    title,
    body: message,
    data,
  }));

  const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const expoBody = await expoRes.json().catch(() => ({}));
  if (!expoRes.ok) {
    console.warn('[push] expo send failed', expoRes.status, expoBody);
    const err = new Error('expo push failed');
    err.status = 502;
    throw err;
  }
  return { ok: true, sent: tokens.length, expo: expoBody };
}

function httpImageUrls(uris) {
  if (!Array.isArray(uris)) return [];
  const next = [];
  for (const item of uris) {
    if (typeof item !== 'string') continue;
    const uri = item.trim();
    if (!/^https?:\/\//i.test(uri) || uri.length > 2000) continue;
    if (next.includes(uri)) continue;
    next.push(uri);
    if (next.length >= 4) break;
  }
  return next;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function resolveAuthUserFromRequest(req) {
  const authHeader = String(req?.headers?.authorization || '');
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;

  try {
    // Firebase ID トークンを優先
    const firebaseUser = await verifyFirebaseIdToken(match[1].trim());
    if (firebaseUser?.ok && firebaseUser.uid) {
      const email = String(firebaseUser.email || '').trim();
      return {
        id: String(firebaseUser.uid),
        email: isValidEmailAddress(email) ? email : '',
      };
    }
    return null;
  } catch (error) {
    console.warn('[contact] auth resolve failed', error);
    return null;
  }
}

async function handleContact(req, body) {
  const message = String(body.message || '').trim();
  if (message.length < 10) {
    const error = new Error('message is too short');
    error.status = 400;
    throw error;
  }
  const category = String(body.category || 'その他').slice(0, 40);
  const name = String(body.name || '').trim() || '未入力';

  // 返信用メールはフォーム入力を必須とする（ログイン時も編集可）
  const fromEmail = String(body.email || '').trim();
  if (!fromEmail || !isValidEmailAddress(fromEmail)) {
    const error = new Error('invalid reply email');
    error.status = 400;
    throw error;
  }

  // 本人確認: Bearer があれば Auth の userId を紐付け（userId のクライアント申告は無視）
  const authUser = await resolveAuthUserFromRequest(req);
  let userId = 'guest';
  let identityLabel = 'ゲスト';
  let accountEmailNote = '';

  if (authUser?.id) {
    userId = authUser.id;
    identityLabel = 'ログイン済み（アカウント紐付け）';
    if (authUser.email && authUser.email.toLowerCase() !== fromEmail.toLowerCase()) {
      accountEmailNote = authUser.email;
    }
  }

  const images = httpImageUrls(body.imageUris);
  // Cloudflare Email Routing: support@spotto.fun 宛に送ると転送される
  const inbox = contactInboxAddress();
  if (!isValidEmailAddress(inbox)) {
    const error = new Error('CONTACT_INBOX / support email is invalid');
    error.status = 503;
    throw error;
  }
  const text = [
    `種別: ${category}`,
    `お名前: ${name}`,
    `返信先: ${fromEmail}`,
    ...(accountEmailNote
      ? [`アカウント登録メール: ${accountEmailNote}`]
      : []),
    `ユーザーID: ${userId}`,
    `本人確認: ${identityLabel}`,
    `端末: ${body.platform || ''} · v${body.appVersion || ''}`,
    '',
    message,
    '',
    ...images.map((uri, index) => `添付${index + 1}: ${uri}`),
  ]
    .filter((line, index, lines) => line !== '' || lines[index - 1] !== '')
    .join('\n');
  const html = [
    `<p>種別: ${escapeHtml(category)}<br/>お名前: ${escapeHtml(name)}<br/>返信先: ${escapeHtml(fromEmail)}${
      accountEmailNote
        ? `<br/>アカウント登録メール: ${escapeHtml(accountEmailNote)}`
        : ''
    }<br/>ユーザーID: ${escapeHtml(userId)}<br/>本人確認: ${escapeHtml(identityLabel)}<br/>端末: ${escapeHtml(body.platform || '')} · v${escapeHtml(body.appVersion || '')}</p>`,
    `<p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>`,
    ...images.map(
      (uri) =>
        `<p>添付: <a href="${escapeHtml(uri)}">${escapeHtml(uri)}</a><br/><img src="${escapeHtml(uri)}" alt="" width="480" /></p>`,
    ),
  ].join('');
  const result = await sendMail({
    to: inbox,
    toName: 'spotto Support',
    subject: `【spotto お問い合わせ】${category}`,
    text,
    html,
    replyTo: fromEmail,
  });
  if (result.skipped) {
    // プロバイダ未設定時は成功にしない → クライアントが mailto にフォールバック
    const error = new Error(
      'mail provider not configured (set RESEND_API_KEY or SENDGRID_API_KEY)',
    );
    error.status = 503;
    throw error;
  }
  return {
    ok: true,
    skipped: false,
    provider: result.provider,
    images: images.length,
    authenticated: Boolean(authUser?.id),
  };
}

function decodeJwtPayload(token) {
  try {
    const payload = String(token || '').split('.')[1];
    if (!payload) return null;
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const filler = '='.repeat((4 - (padded.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded + filler, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

async function fetchLineProfile(accessToken) {
  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = await profileRes.json();
  if (!profileRes.ok || !profile.userId) {
    const error = new Error(
      profile.message || profile.error_description || 'LINE profile fetch failed',
    );
    error.status = 401;
    throw error;
  }
  return profile;
}

/** LINE access token の有効性を検証（チャネル一致も確認） */
async function verifyLineAccessToken(accessToken) {
  const channelId =
    env('LINE_CHANNEL_ID') || env('EXPO_PUBLIC_LINE_CHANNEL_ID');
  const verifyRes = await fetch(
    `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`,
    { method: 'GET' },
  );
  const verified = await verifyRes.json();
  if (!verifyRes.ok || !verified.client_id) {
    const error = new Error(
      verified.error_description || 'LINE access token is invalid',
    );
    error.status = 401;
    throw error;
  }
  if (channelId && String(verified.client_id) !== String(channelId)) {
    const error = new Error('LINE channel ID mismatch');
    error.status = 401;
    throw error;
  }
  return verified;
}

/**
 * 認可コード → LINE access token（Web / PKCE 用）
 */
async function exchangeLineAuthorizationCode(body) {
  const channelId =
    env('LINE_CHANNEL_ID') || env('EXPO_PUBLIC_LINE_CHANNEL_ID');
  const secret = env('LINE_CHANNEL_SECRET');
  if (!channelId || !secret) {
    const error = new Error('LINE_CHANNEL_ID / LINE_CHANNEL_SECRET is not set');
    error.status = 503;
    throw error;
  }
  const code = String(body.code || '').trim();
  const redirectUri = String(body.redirectUri || '').trim();
  const codeVerifier = String(body.codeVerifier || '').trim();
  if (!code || !redirectUri) {
    const error = new Error('code and redirectUri are required');
    error.status = 400;
    throw error;
  }
  const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: channelId,
      client_secret: secret,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokenRes.ok || !tokens.access_token) {
    const error = new Error(
      tokens.error_description || 'LINE token exchange failed',
    );
    error.status = 401;
    throw error;
  }
  return tokens;
}

/** レガシー: 認可コード → LINE プロフィール（Firebase 移行前互換） */
async function handleLineToken(body) {
  const tokens = await exchangeLineAuthorizationCode(body);
  const profile = await fetchLineProfile(tokens.access_token);
  const claims = decodeJwtPayload(tokens.id_token);
  const email =
    (typeof claims?.email === 'string' && claims.email) ||
    (typeof tokens.email === 'string' && tokens.email) ||
    '';

  return {
    profile: {
      id: profile.userId,
      name: profile.displayName || 'LINEユーザー',
      email,
      imageUri: profile.pictureUrl || '',
    },
    accessToken: tokens.access_token,
    idToken: tokens.id_token || '',
  };
}

/**
 * LINE → Firebase Custom Token
 * body: { accessToken, idToken? } または { code, redirectUri, codeVerifier? }
 */
async function handleLineFirebase(body) {
  if (!getFirebaseAdmin()) {
    const error = new Error(
      getFirebaseAdminInitError() ||
        'FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS is required',
    );
    error.status = 503;
    throw error;
  }

  let accessToken = String(body.accessToken || '').trim();
  let idToken = String(body.idToken || '').trim();

  if (!accessToken && body.code) {
    const tokens = await exchangeLineAuthorizationCode(body);
    accessToken = String(tokens.access_token || '').trim();
    idToken = String(tokens.id_token || idToken || '').trim();
  }

  if (!accessToken) {
    const error = new Error('accessToken (or code) is required');
    error.status = 400;
    throw error;
  }

  await verifyLineAccessToken(accessToken);
  const profile = await fetchLineProfile(accessToken);

  let email = '';
  if (idToken) {
    const claims = decodeJwtPayload(idToken);
    if (typeof claims?.email === 'string') email = claims.email;
  }

  const { uid, customToken } = await createLineCustomToken(profile.userId, {
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl,
    email,
  });

  console.log('[auth] line-firebase ok', { uid, lineUserId: profile.userId });

  return {
    customToken,
    uid,
    // クライアントは Custom Token で signIn → ID トークンを取得する
    profile: {
      id: profile.userId,
      name: profile.displayName || 'LINEユーザー',
      email,
      imageUri: profile.pictureUrl || '',
    },
  };
}

/** Firebase ID トークンに role: authenticated を付与 */
async function handleFirebaseEnsureClaims(req) {
  if (!getFirebaseAdmin()) {
    const error = new Error(
      getFirebaseAdminInitError() ||
        'FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS is required',
    );
    error.status = 503;
    throw error;
  }
  const authHeader = String(req.headers.authorization || '');
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    const error = new Error('missing authorization');
    error.status = 401;
    throw error;
  }
  // checkRevoked は追加の Google API 呼び出しが必要。クレーム付与では署名検証のみで十分
  const decoded = await verifyFirebaseIdToken(match[1].trim(), {
    checkRevoked: false,
  });
  if (!decoded.ok || !decoded.uid) {
    const error = new Error(
      decoded.detail || decoded.error || 'unauthorized',
    );
    error.status = decoded.status || 401;
    throw error;
  }
  const result = await ensureAuthenticatedRole(decoded.uid);
  if (!result.ok) {
    const error = new Error(
      result.error ||
        'Failed to set custom claims. Check FIREBASE_SERVICE_ACCOUNT_JSON.',
    );
    error.status = 503;
    throw error;
  }
  return {
    ok: true,
    needsRefresh: result.needsRefresh,
    uid: decoded.uid,
    role: 'authenticated',
  };
}

async function handleReminders(req) {
  const secret = env('CRON_SECRET');
  const header = String(req.headers['x-cron-secret'] || '');
  if (secret && header !== secret) {
    const error = new Error('unauthorized');
    error.status = 401;
    throw error;
  }
  const now = Date.now();
  const windowMs = 24 * 60 * 60 * 1000;
  const bookings = readBookings();
  let sent = 0;
  for (const booking of bookings) {
    if (booking.reminderSentAt) continue;
    const start = Date.parse(booking.startsAt || '');
    if (!Number.isFinite(start)) continue;
    if (start <= now || start > now + windowMs) continue;
    const copy = mailCopy('event_reminder', booking);
    await sendMail({
      to: booking.toEmail,
      toName: booking.toName,
      subject: copy.subject,
      text: copy.text,
    });
    booking.reminderSentAt = new Date().toISOString();
    sent += 1;
  }
  writeBookings(bookings);
  return { ok: true, sent };
}

/** 開発用 SMS OTP（本番では Twilio 等に差し替え） */
const phoneOtps = new Map();

function normalizePhoneE164(input) {
  const raw = String(input || '')
    .replace(/[０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    .replace(/[＋]/g, '+');
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return null;
  let national = digits;
  if (national.startsWith('+81')) national = `0${national.slice(3)}`;
  else if (national.startsWith('81') && national.length >= 11) {
    national = `0${national.slice(2)}`;
  }
  if (!/^0\d{9,10}$/.test(national)) return null;
  return `+81${national.slice(1)}`;
}

/** PHONE_TEST_NUMBERS=09012345678:123456,+8190...:000000（サーバー側） */
function phoneTestNumberMap() {
  const map = new Map();
  // クライアントと同じ既定テスト番号
  map.set('+819012345678', '123456');
  const raw = env('PHONE_TEST_NUMBERS') || env('EXPO_PUBLIC_PHONE_TEST_NUMBERS');
  for (const entry of String(raw || '')
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)) {
    const [phonePart, codePart] = entry.split(':');
    const phone = normalizePhoneE164(phonePart);
    const code = String(codePart || '').trim();
    if (phone && /^\d{6}$/.test(code)) map.set(phone, code);
  }
  return map;
}

async function handlePhoneSend(body) {
  const phone = normalizePhoneE164(body.phone);
  if (!phone) {
    const err = new Error(
      'invalid phone (use E.164 like +819012345678 or national 09012345678)',
    );
    err.status = 400;
    throw err;
  }
  const tests = phoneTestNumberMap();
  const code =
    tests.get(phone) ||
    String(Math.floor(100000 + Math.random() * 900000));
  phoneOtps.set(phone, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
  console.log(`[phone] OTP for ${phone}: ${code}`);
  // モックサーバーのため開発時はコードを返す（本番 Twilio 差し替え時は返さない）
  return { ok: true, mock: true, phone, code };
}

async function handlePhoneVerify(body) {
  const phone = normalizePhoneE164(body.phone);
  const code = String(body.code || '').trim();
  if (!phone || !/^\d{6}$/.test(code)) {
    const err = new Error('invalid code');
    err.status = 400;
    throw err;
  }
  const tests = phoneTestNumberMap();
  if (tests.get(phone) === code) {
    phoneOtps.delete(phone);
    return { ok: true, test: true };
  }
  const entry = phoneOtps.get(phone);
  if (!entry || entry.expiresAt < Date.now() || entry.code !== code) {
    const err = new Error('code mismatch');
    err.status = 400;
    throw err;
  }
  phoneOtps.delete(phone);
  return { ok: true };
}

/**
 * 退会: Bearer アクセストークンのユーザーを Auth Admin API で削除。
 * profiles / blocks は FK CASCADE（または事前 DELETE）で連動。
 */
async function handleAccountDelete(req) {
  const supabaseUrl = env('EXPO_PUBLIC_SUPABASE_URL').replace(/\/+$/, '').replace(
    /\/auth\/v1$/i,
    '',
  );
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');

  const authHeader = String(req.headers.authorization || '');
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    const err = new Error('missing authorization');
    err.status = 401;
    throw err;
  }
  const accessToken = match[1].trim();

  const firebaseUser = await verifyFirebaseIdToken(accessToken);
  if (!firebaseUser?.ok || !firebaseUser.uid) {
    const err = new Error(
      firebaseUser?.detail || firebaseUser?.error || 'unauthorized',
    );
    err.status = firebaseUser?.status || 401;
    throw err;
  }
  const userId = firebaseUser.uid;

  // public データの明示削除（DB が残っている場合）
  if (supabaseUrl && serviceKey) {
    await fetch(
      `${supabaseUrl}/rest/v1/blocks?or=(blocker_id.eq.${encodeURIComponent(userId)},blocked_id.eq.${encodeURIComponent(userId)})`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          Prefer: 'return=minimal',
        },
      },
    );
    await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          Prefer: 'return=minimal',
        },
      },
    );
    await fetch(
      `${supabaseUrl}/rest/v1/device_push_tokens?user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          Prefer: 'return=minimal',
        },
      },
    );
  }

  const deleted = await deleteFirebaseUser(userId);
  if (!deleted) {
    const err = new Error('Firebase Auth user delete failed');
    err.status = 500;
    throw err;
  }

  return { ok: true, userId };
}

const PLATFORM_FEE_RATE = 0.1;
/** Stripe カード決済の目安（ガイドラインの決済手数料） */
const PAYMENT_FEE_RATE = 0.036;
const PAYOUT_FEE_YEN = 500;

function calcPayoutBreakdownServer(grossYen) {
  const gross = Math.max(0, Math.floor(Number(grossYen) || 0));
  const paymentFeeYen = Math.floor(gross * PAYMENT_FEE_RATE);
  const platformFeeYen = Math.floor(gross * PLATFORM_FEE_RATE);
  const afterFees = Math.max(0, gross - paymentFeeYen - platformFeeYen);
  const payoutFeeYen = afterFees > 0 ? PAYOUT_FEE_YEN : 0;
  const netYen = Math.max(0, afterFees - payoutFeeYen);
  return {
    grossYen: gross,
    paymentFeeYen,
    platformFeeYen,
    payoutFeeYen,
    netYen,
  };
}

/** イベント終了後のみ振込対象（確定） */
function isConfirmedSaleRow(row, now = new Date()) {
  const endsAt = row?.event_ends_at;
  if (endsAt) {
    const t = Date.parse(endsAt);
    if (Number.isFinite(t)) return t <= now.getTime();
  }
  const dateKey = String(row?.event_date || row?.paid_at || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const end = Date.parse(`${dateKey}T23:59:59+09:00`);
  return Number.isFinite(end) && end <= now.getTime();
}

async function notifyOrganizerPayoutPaid({
  hostId,
  yearMonth,
  netYen,
  grossYen,
  paymentFeeYen,
  platformFeeYen,
  payoutFeeYen,
  payoutId,
}) {
  const supabaseUrl = supabaseBaseUrl();
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey || !hostId) {
    return { emailed: false, pushed: false };
  }

  // 優先: Edge Function（DB トリガーと同じワーカー。notified_at で二重送信防止）
  const edgeUrl =
    env('PAYOUT_NOTIFY_FUNCTION_URL') ||
    (supabaseUrl
      ? `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/notify-payout-paid`
      : '');
  const notifySecret = env('PAYOUT_NOTIFY_SECRET');
  if (edgeUrl) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${notifySecret || serviceKey}`,
      };
      if (notifySecret) {
        headers['x-spotto-notify-secret'] = notifySecret;
      }
      const edgeRes = await fetch(edgeUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          payoutId: payoutId || undefined,
          hostId,
          yearMonth,
        }),
      });
      const edgeBody = await edgeRes.json().catch(() => ({}));
      if (edgeRes.ok) {
        return {
          emailed: Boolean(edgeBody?.emailed),
          pushed: Number(edgeBody?.pushed || 0) > 0,
          via: 'edge',
          skipped: Boolean(edgeBody?.skipped),
          detail: edgeBody,
        };
      }
      console.warn('[admin] edge notify failed', edgeRes.status, edgeBody);
    } catch (error) {
      console.warn('[admin] edge notify error', error);
    }
  }

  // フォールバック: API サーバー内でメール + プッシュ
  let toName = '主催者';
  try {
    const userRes = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(hostId)}`,
      { headers: serviceRoleHeaders() },
    );
    const userBody = await userRes.json().catch(() => ({}));
    if (userRes.ok) {
      const meta = userBody?.user_metadata || {};
      toName =
        String(meta.display_name || meta.full_name || meta.name || '').trim() ||
        toName;
    }
  } catch (error) {
    console.warn('[admin] fetch host for payout notify failed', error);
  }

  if (!toName || toName === '主催者') {
    try {
      const profileRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(hostId)}&select=display_name,nickname`,
        { headers: serviceRoleHeaders() },
      );
      const profiles = await profileRes.json().catch(() => []);
      const p = Array.isArray(profiles) ? profiles[0] : null;
      toName =
        String(p?.display_name || p?.nickname || '').trim() || toName;
    } catch {
      /* ignore */
    }
  }

  let bank = null;
  try {
    const bankRes = await fetch(
      `${supabaseUrl}/rest/v1/organizer_bank_accounts?user_id=eq.${encodeURIComponent(hostId)}` +
        `&select=bank_name,branch_name,branch_number,account_type,account_number,account_holder_kana,notify_email`,
      { headers: serviceRoleHeaders() },
    );
    const banks = await bankRes.json().catch(() => []);
    bank = Array.isArray(banks) ? banks[0] : null;
  } catch {
    /* ignore */
  }

  // Auth 登録メールではなく、口座の通知用メールを使う
  const toEmail = String(bank?.notify_email || '').trim().toLowerCase();

  const [y, m] = String(yearMonth || '').split('-');
  const monthLabelText =
    y && m ? `${Number(y)}年${Number(m)}月分` : String(yearMonth || '');
  const gross = Math.max(0, Math.floor(Number(grossYen) || 0));
  const paymentFee = Math.max(
    0,
    Math.floor(
      Number(paymentFeeYen) || Math.floor(gross * PAYMENT_FEE_RATE),
    ),
  );
  const platformFee = Math.max(0, Math.floor(Number(platformFeeYen) || 0));
  const payoutFee = Math.max(0, Math.floor(Number(payoutFeeYen) || PAYOUT_FEE_YEN));
  const net = Math.max(0, Math.floor(Number(netYen) || 0));
  const yen = (n) => `${n.toLocaleString('ja-JP')}円`;
  const accountType =
    bank?.account_type === 'checking' ? '当座' : '普通';
  const accountNumber = String(bank?.account_number || '');
  const maskedAccount =
    accountNumber.length > 3
      ? `${'*'.repeat(accountNumber.length - 3)}${accountNumber.slice(-3)}`
      : accountNumber;

  const bankLines = bank
    ? [
        `銀行名: ${bank.bank_name || ''}`,
        `支店名 / 支店番号: ${bank.branch_name || ''}（${bank.branch_number || '—'}）`,
        `口座種別: ${accountType}`,
        `口座番号: ${maskedAccount}`,
        `口座名義: ${bank.account_holder_kana || ''}`,
      ]
    : [
        '（振込時点で口座情報が取得できませんでした。アプリの振込口座画面をご確認ください）',
      ];

  const subject = `【spotto】${monthLabelText}の売上金の振込が完了しました`;
  const text = [
    `${toName} さん`,
    '',
    `${monthLabelText}の売上金を、ご登録の口座にお振り込みいたしました。`,
    '',
    '■ 振込内容',
    `売上総額: ${yen(gross)}`,
    `決済手数料: −${yen(paymentFee)}`,
    `プラットフォーム利用料（10%）: −${yen(platformFee)}`,
    `振込手数料: −${yen(payoutFee)}`,
    `手取り額（振込金額）: ${yen(net)}`,
    '',
    '■ 振込先口座',
    ...bankLines,
    '',
    '■ 注意事項',
    '・口座への反映は、金融機関により1〜2営業日程度かかる場合があります。',
    '・金額や口座に相違がある場合は、アプリ内「お問い合わせ」よりご連絡ください。',
    '・詳細はマイページ「売上管理」でもご確認いただけます。',
    '',
    'spotto 運営',
  ].join('\n');

  let emailed = false;
  if (toEmail && isValidEmailAddress(toEmail)) {
    try {
      await sendMail({ to: toEmail, toName, subject, text });
      emailed = true;
    } catch (error) {
      console.warn('[admin] payout email failed', error);
    }
  } else {
    console.info('[admin] payout notify: no bank notify_email', {
      hostId,
      yearMonth,
    });
  }

  let pushed = false;
  try {
    const pushResult = await handlePush({
      userIds: [hostId],
      title: '【spotto】売上金の振込が完了しました',
      body:
        '対象月の売上金をご登録の口座にお振り込みいたしました。詳細はマイページよりご確認ください。',
      data: { kind: 'payout_paid', yearMonth, screen: 'sales' },
    });
    pushed = Boolean(pushResult?.sent > 0);
  } catch (error) {
    console.warn('[admin] payout push failed', error);
  }

  // フォールバック送信後も notified_at を立てて Edge との二重送信を防ぐ
  try {
    const idFilter = payoutId
      ? `id=eq.${encodeURIComponent(payoutId)}`
      : `host_id=eq.${encodeURIComponent(hostId)}&year_month=eq.${encodeURIComponent(yearMonth)}`;
    await fetch(`${supabaseUrl}/rest/v1/organizer_payouts?${idFilter}`, {
      method: 'PATCH',
      headers: {
        ...serviceRoleHeaders(),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ notified_at: new Date().toISOString() }),
    });
  } catch {
    /* ignore */
  }

  return { emailed, pushed, via: 'api-fallback' };
}

function parseAdminUserIds() {
  return env('ADMIN_USER_IDS')
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function supabaseBaseUrl() {
  return env('EXPO_PUBLIC_SUPABASE_URL')
    .replace(/\/+$/, '')
    .replace(/\/auth\/v1$/i, '');
}

function supabaseAnonKey() {
  return (
    env('EXPO_PUBLIC_SUPABASE_ANON_KEY') ||
    env('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  );
}

function serviceRoleHeaders() {
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  return {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    Prefer: 'return=representation',
  };
}

async function resolveAuthUserDetailed(req) {
  const authHeader = String(req?.headers?.authorization || '');
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;

  try {
    const firebaseUser = await verifyFirebaseIdToken(match[1].trim());
    if (!firebaseUser?.ok || !firebaseUser.uid) return null;
    const email = String(firebaseUser.email || '').trim();
    const claims = firebaseUser.claims || {};
    return {
      id: String(firebaseUser.uid),
      email: isValidEmailAddress(email) ? email : '',
      appMetadata: {
        role: claims.role,
        is_admin: claims.is_admin === true || claims.admin === true,
      },
      accessToken: match[1].trim(),
    };
  } catch (error) {
    console.warn('[admin] auth resolve failed', error);
    return null;
  }
}

async function isAdminUser(user) {
  if (!user?.id) return false;
  if (parseAdminUserIds().includes(user.id)) return true;
  const meta = user.appMetadata || {};
  if (meta.role === 'admin' || meta.is_admin === true) return true;

  const supabaseUrl = supabaseBaseUrl();
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return false;

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=is_admin`,
      { headers: serviceRoleHeaders() },
    );
    const rows = await res.json().catch(() => []);
    if (!res.ok || !Array.isArray(rows) || !rows[0]) return false;
    return Boolean(rows[0].is_admin);
  } catch (error) {
    console.warn('[admin] profile is_admin check failed', error);
    return false;
  }
}

async function requireAdminIdentity(req) {
  const user = await resolveAuthUserDetailed(req);
  if (!user) {
    const err = new Error('ログインが必要です。');
    err.status = 401;
    throw err;
  }
  if (!(await isAdminUser(user))) {
    const err = new Error('管理者権限がありません。');
    err.status = 403;
    throw err;
  }
  return user;
}

async function requireAdmin(req) {
  const user = await requireAdminIdentity(req);
  if (!env('SUPABASE_SERVICE_ROLE_KEY') || !supabaseBaseUrl()) {
    const err = new Error('サーバー設定が不足しています（SERVICE_ROLE / SUPABASE_URL）。');
    err.status = 500;
    throw err;
  }
  return user;
}

function parseYearMonth(raw) {
  const text = String(raw || '').trim();
  if (!/^\d{4}-\d{2}$/.test(text)) return null;
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(5, 7));
  if (!year || month < 1 || month > 12) return null;
  const lastDay = new Date(year, month, 0).getDate();
  const pad = (n) => String(n).padStart(2, '0');
  return {
    yearMonth: text,
    year,
    month,
    startDate: `${year}-${pad(month)}-01`,
    endDate: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

/** メニュー表示用: SERVICE_ROLE 無しでも ADMIN_USER_IDS / JWT claims で判定可 */
async function handleAdminAccess(req) {
  const user = await requireAdminIdentity(req);
  return {
    ok: true,
    isAdmin: true,
    userId: user.id,
  };
}

async function handleAdminPayoutsList(req, url) {
  const admin = await requireAdmin(req);
  const parsed =
    parseYearMonth(url.searchParams.get('yearMonth')) ||
    (() => {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      return parseYearMonth(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`);
    })();
  if (!parsed) {
    const err = new Error('yearMonth は YYYY-MM 形式で指定してください。');
    err.status = 400;
    throw err;
  }

  const supabaseUrl = supabaseBaseUrl();
  // 終了済み（振込待ち確定）の売上のみ集計。返金済みは status!=paid で除外済み。
  let salesRes = await fetch(
    `${supabaseUrl}/rest/v1/event_ticket_sales` +
      `?status=eq.paid&select=host_id,event_id,event_title,event_date,amount_yen,ticket_quantity,paid_at,event_ends_at&limit=100000`,
    { headers: serviceRoleHeaders() },
  );
  let salesRows = await salesRes.json().catch(() => []);
  if (
    !salesRes.ok &&
    String(salesRows?.message || salesRows?.error || '').includes(
      'ticket_quantity',
    )
  ) {
    salesRes = await fetch(
      `${supabaseUrl}/rest/v1/event_ticket_sales` +
        `?status=eq.paid&select=host_id,event_id,event_title,event_date,amount_yen,paid_at,event_ends_at&limit=100000`,
      { headers: serviceRoleHeaders() },
    );
    salesRows = await salesRes.json().catch(() => []);
  }
  if (!salesRes.ok) {
    const err = new Error(
      salesRows?.message || salesRows?.error || '売上の取得に失敗しました。',
    );
    err.status = 500;
    throw err;
  }

  const now = new Date();
  const byHost = new Map();
  for (const row of Array.isArray(salesRows) ? salesRows : []) {
    const hostId = String(row.host_id || '').trim();
    if (!hostId) continue;
    const dateKey = String(row.event_date || row.paid_at || '').slice(0, 10);
    if (
      !dateKey ||
      dateKey < parsed.startDate ||
      dateKey > parsed.endDate
    ) {
      continue;
    }
    if (!isConfirmedSaleRow(row, now)) continue;
    const amount = Math.max(0, Math.floor(Number(row.amount_yen) || 0));
    const qty = Math.max(1, Math.floor(Number(row.ticket_quantity) || 1));
    const eventId = String(row.event_id || '').trim() || 'unknown';
    const prev = byHost.get(hostId) || {
      grossYen: 0,
      ticketCount: 0,
      events: new Map(),
    };
    prev.grossYen += amount;
    prev.ticketCount += qty;
    const ev = prev.events.get(eventId) || {
      eventId,
      eventTitle: String(row.event_title || '').trim() || 'イベント',
      eventDate: row.event_date ? String(row.event_date).slice(0, 10) : '',
      ticketCount: 0,
      grossYen: 0,
    };
    ev.ticketCount += qty;
    ev.grossYen += amount;
    if (!ev.eventTitle && row.event_title) {
      ev.eventTitle = String(row.event_title).trim();
    }
    prev.events.set(eventId, ev);
    byHost.set(hostId, prev);
  }

  const hostIds = [...byHost.keys()];
  if (hostIds.length === 0) {
    return {
      ok: true,
      yearMonth: parsed.yearMonth,
      rows: [],
      requestedBy: admin.id,
    };
  }

  const inList = `(${hostIds.map((id) => `"${id}"`).join(',')})`;

  const [profilesRes, banksRes, payoutsRes] = await Promise.all([
    fetch(
      `${supabaseUrl}/rest/v1/profiles?id=in.${inList}&select=id,display_name,nickname`,
      { headers: serviceRoleHeaders() },
    ),
    fetch(
      `${supabaseUrl}/rest/v1/organizer_bank_accounts?user_id=in.${inList}` +
        `&select=user_id,bank_name,branch_name,branch_number,account_type,account_number,account_holder_kana,notify_email`,
      { headers: serviceRoleHeaders() },
    ),
    fetch(
      `${supabaseUrl}/rest/v1/organizer_payouts?year_month=eq.${parsed.yearMonth}` +
        `&host_id=in.${inList}&select=host_id,status,paid_at,gross_yen,platform_fee_yen,payout_fee_yen,net_yen`,
      { headers: serviceRoleHeaders() },
    ),
  ]);

  const profiles = await profilesRes.json().catch(() => []);
  const banks = await banksRes.json().catch(() => []);
  const payouts = await payoutsRes.json().catch(() => []);

  if (!profilesRes.ok) {
    console.warn('[admin] profiles fetch', profiles);
  }
  if (!banksRes.ok) {
    console.warn('[admin] banks fetch', banks);
  }
  if (!payoutsRes.ok) {
    console.warn('[admin] payouts fetch', payouts);
  }

  const profileMap = new Map();
  for (const p of Array.isArray(profiles) ? profiles : []) {
    profileMap.set(String(p.id), p);
  }
  const bankMap = new Map();
  for (const b of Array.isArray(banks) ? banks : []) {
    bankMap.set(String(b.user_id), b);
  }
  const payoutMap = new Map();
  for (const p of Array.isArray(payouts) ? payouts : []) {
    payoutMap.set(String(p.host_id), p);
  }

  const rows = hostIds
    .map((hostId) => {
      const agg = byHost.get(hostId);
      const breakdown = calcPayoutBreakdownServer(agg.grossYen);
      const profile = profileMap.get(hostId);
      const bank = bankMap.get(hostId);
      const payout = payoutMap.get(hostId);
      const hostName =
        String(profile?.display_name || '').trim() ||
        String(profile?.nickname || '').trim() ||
        '（名前未設定）';
      const events = [...(agg.events?.values?.() || [])]
        .map((ev) => {
          const paymentFee = Math.floor(ev.grossYen * PAYMENT_FEE_RATE);
          const fee = Math.floor(ev.grossYen * PLATFORM_FEE_RATE);
          return {
            eventId: ev.eventId,
            eventTitle: ev.eventTitle,
            eventDate: ev.eventDate || undefined,
            ticketCount: ev.ticketCount,
            grossYen: ev.grossYen,
            paymentFeeYen: paymentFee,
            platformFeeYen: fee,
            netAfterPlatformYen: Math.max(
              0,
              ev.grossYen - paymentFee - fee,
            ),
          };
        })
        .sort((a, b) =>
          String(b.eventDate || '').localeCompare(String(a.eventDate || '')),
        );
      console.log('[admin/payouts] host breakdown', {
        hostId,
        hostName,
        yearMonth: parsed.yearMonth,
        events: events.map((e) => ({
          eventId: e.eventId,
          title: e.eventTitle,
          grossYen: e.grossYen,
          paymentFeeYen: e.paymentFeeYen,
          platformFeeYen: e.platformFeeYen,
          netAfterPlatformYen: e.netAfterPlatformYen,
        })),
        grossYen: breakdown.grossYen,
        paymentFeeYen: breakdown.paymentFeeYen,
        netYen: breakdown.netYen,
      });
      return {
        hostId,
        hostName,
        hostEmail: '',
        yearMonth: parsed.yearMonth,
        ticketCount: agg.ticketCount,
        grossYen: breakdown.grossYen,
        paymentFeeYen: breakdown.paymentFeeYen,
        platformFeeYen: breakdown.platformFeeYen,
        payoutFeeYen: breakdown.payoutFeeYen,
        netYen: breakdown.netYen,
        status: payout?.status === 'paid' ? 'paid' : 'pending',
        paidAt: payout?.paid_at || undefined,
        events,
        bank: bank
          ? {
              bankName: String(bank.bank_name || ''),
              branchName: String(bank.branch_name || ''),
              branchNumber: String(bank.branch_number || ''),
              accountType:
                bank.account_type === 'checking' ? 'checking' : 'ordinary',
              accountNumber: String(bank.account_number || ''),
              accountHolderKana: String(bank.account_holder_kana || ''),
              notifyEmail: String(bank.notify_email || '').trim().toLowerCase(),
            }
          : null,
      };
    })
    .sort((a, b) => a.hostName.localeCompare(b.hostName, 'ja'));

  return {
    ok: true,
    yearMonth: parsed.yearMonth,
    rows,
    requestedBy: admin.id,
  };
}

async function handleAdminPayoutsUpdate(req, body) {
  const admin = await requireAdmin(req);
  const hostId = String(body?.hostId || '').trim();
  const status = String(body?.status || '').trim();
  const parsed = parseYearMonth(body?.yearMonth);
  if (!hostId || !parsed) {
    const err = new Error('hostId と yearMonth (YYYY-MM) が必要です。');
    err.status = 400;
    throw err;
  }
  if (status !== 'pending' && status !== 'paid') {
    const err = new Error('status は pending または paid です。');
    err.status = 400;
    throw err;
  }

  const supabaseUrl = supabaseBaseUrl();
  const salesRes = await fetch(
    `${supabaseUrl}/rest/v1/event_ticket_sales` +
      `?status=eq.paid&host_id=eq.${encodeURIComponent(hostId)}` +
      `&select=amount_yen,event_date,paid_at,event_ends_at`,
    { headers: serviceRoleHeaders() },
  );
  const salesRows = await salesRes.json().catch(() => []);
  if (!salesRes.ok) {
    const err = new Error('売上の再集計に失敗しました。');
    err.status = 500;
    throw err;
  }

  const now = new Date();
  let grossYen = 0;
  for (const row of Array.isArray(salesRows) ? salesRows : []) {
    const dateKey = String(row.event_date || row.paid_at || '').slice(0, 10);
    if (dateKey < parsed.startDate || dateKey > parsed.endDate) continue;
    if (!isConfirmedSaleRow(row, now)) continue;
    grossYen += Math.max(0, Math.floor(Number(row.amount_yen) || 0));
  }
  const breakdown = calcPayoutBreakdownServer(grossYen);
  const nowIso = new Date().toISOString();
  const payload = {
    host_id: hostId,
    year_month: parsed.yearMonth,
    status,
    gross_yen: breakdown.grossYen,
    platform_fee_yen: breakdown.platformFeeYen,
    payout_fee_yen: breakdown.payoutFeeYen,
    net_yen: breakdown.netYen,
    paid_at: status === 'paid' ? nowIso : null,
    updated_by: admin.id,
    updated_at: nowIso,
  };

  const upsertRes = await fetch(
    `${supabaseUrl}/rest/v1/organizer_payouts?on_conflict=host_id,year_month`,
    {
      method: 'POST',
      headers: {
        ...serviceRoleHeaders(),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(payload),
    },
  );
  const upsertBody = await upsertRes.json().catch(() => ({}));
  if (!upsertRes.ok) {
    const err = new Error(
      upsertBody?.message ||
        upsertBody?.error ||
        '振込ステータスの更新に失敗しました。',
    );
    err.status = 500;
    throw err;
  }

  let notify = null;
  if (status === 'paid') {
    const row = Array.isArray(upsertBody) ? upsertBody[0] : upsertBody;
    notify = await notifyOrganizerPayoutPaid({
      hostId,
      yearMonth: parsed.yearMonth,
      payoutId: row?.id,
      netYen: breakdown.netYen,
      grossYen: breakdown.grossYen,
      paymentFeeYen: breakdown.paymentFeeYen,
      platformFeeYen: breakdown.platformFeeYen,
      payoutFeeYen: breakdown.payoutFeeYen,
    });
  }

  return {
    ok: true,
    row: Array.isArray(upsertBody) ? upsertBody[0] : upsertBody,
    notify,
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const route = `${req.method} ${url.pathname.replace(/\/$/, '') || '/'}`;
  const pathname = url.pathname.replace(/\/$/, '') || '/';

  try {
    if (route === 'GET /' || route === 'GET /health') {
      const account = await resolveStripeAccount();
      const mode = stripeMode();
      const pkMeta = stripeKeyMeta(stripePublishableKeyFromEnv());
      const skMeta = stripeKeyMeta(stripeSecretKey());
      const keyMatch =
        Boolean(pkMeta.bodyPrefix) &&
        Boolean(skMeta.bodyPrefix) &&
        pkMeta.bodyPrefix === skMeta.bodyPrefix &&
        pkMeta.mode === skMeta.mode;
      const modeMatch =
        (!skMeta.mode || skMeta.mode === mode) &&
        (!pkMeta.mode || pkMeta.mode === mode);
      const fbOk = Boolean(getFirebaseAdmin());
      json(res, 200, {
        ok: true,
        // 古い／別サービスの {"status":"ok"} と区別するための識別子
        status: 'ok',
        service: 'spotto-api',
        auth: {
          lineFirebase: 'POST /auth/line-firebase',
          lineToken: 'POST /auth/line-token',
          ensureClaims: 'POST /auth/firebase-ensure-claims',
          firebaseAdmin: fbOk,
        },
        stripe: {
          mode,
          configured: Boolean(stripeSecretKey()),
          accountId: account.ok ? account.id : null,
          email: account.ok ? account.email : null,
          livemode: account.ok ? account.livemode : mode === 'live',
          chargesEnabled: account.ok ? account.chargesEnabled : null,
          secretKey: skMeta.fingerprint || null,
          publishableKey: pkMeta.fingerprint || null,
          keysMatch: keyMatch,
          modeMatch,
          error: account.ok ? null : account.error || null,
          dashboardPayments: account.ok
            ? mode === 'live' || skMeta.mode === 'live'
              ? 'https://dashboard.stripe.com/payments'
              : 'https://dashboard.stripe.com/test/payments'
            : null,
        },
      });
      return;
    }

    // 認証ルートの存在確認（デプロイ検証用。本体は POST）
    if (
      (pathname === '/auth/line-firebase' ||
        pathname === '/auth/line-token' ||
        pathname === '/auth/firebase-ensure-claims') &&
      (req.method === 'GET' || req.method === 'HEAD')
    ) {
      json(res, 200, {
        ok: true,
        service: 'spotto-api',
        endpoint: pathname,
        methods: ['POST'],
        hint:
          pathname === '/auth/line-firebase'
            ? 'POST JSON { accessToken, idToken? } or { code, redirectUri, codeVerifier? }'
            : undefined,
      });
      return;
    }

    if (pathname === '/admin/access' && req.method === 'GET') {
      json(res, 200, await handleAdminAccess(req));
      return;
    }
    if (pathname === '/admin/payouts' && req.method === 'GET') {
      json(res, 200, await handleAdminPayoutsList(req, url));
      return;
    }
    if (pathname === '/admin/payouts' && req.method === 'POST') {
      const body = await readJson(req);
      json(res, 200, await handleAdminPayoutsUpdate(req, body));
      return;
    }

    if (req.method !== 'POST') {
      json(res, 404, {
        error: 'not found',
        service: 'spotto-api',
        path: pathname,
        method: req.method,
      });
      return;
    }

    const body = await readJson(req);
    if (pathname === '/payments') {
      json(res, 200, await handlePayments(body));
      return;
    }
    if (pathname === '/payments/status') {
      json(res, 200, await handlePaymentIntentStatus(body));
      return;
    }
    if (pathname === '/payments/confirm') {
      json(res, 200, await handlePaymentConfirm(body));
      return;
    }
    if (pathname === '/refunds') {
      json(res, 200, await handleRefunds(body));
      return;
    }
    if (pathname === '/notify') {
      json(res, 200, await handleNotify(body));
      return;
    }
    if (pathname === '/push') {
      json(res, 200, await handlePush(body));
      return;
    }
    if (pathname === '/contact') {
      json(res, 200, await handleContact(req, body));
      return;
    }
    if (pathname === '/auth/line-token') {
      json(res, 200, await handleLineToken(body));
      return;
    }
    if (pathname === '/auth/line-firebase') {
      json(res, 200, await handleLineFirebase(body));
      return;
    }
    if (pathname === '/auth/firebase-ensure-claims') {
      json(res, 200, await handleFirebaseEnsureClaims(req));
      return;
    }
    if (pathname === '/phone/send') {
      json(res, 200, await handlePhoneSend(body));
      return;
    }
    if (pathname === '/phone/verify') {
      json(res, 200, await handlePhoneVerify(body));
      return;
    }
    if (pathname === '/account/delete') {
      json(res, 200, await handleAccountDelete(req));
      return;
    }
    if (pathname === '/cron/reminders') {
      json(res, 200, await handleReminders(req));
      return;
    }
    json(res, 404, {
      error: 'not found',
      service: 'spotto-api',
      path: pathname,
      method: req.method,
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.warn('[api]', route, error);
    json(res, status, {
      error: error instanceof Error ? error.message : 'server error',
      service: 'spotto-api',
    });
  }
});

server.listen(PORT, HOST, () => {
  const mode = stripeMode();
  const secret = stripeSecretKey();
  const publishable = stripePublishableKeyFromEnv();
  const skMeta = stripeKeyMeta(secret);
  const pkMeta = stripeKeyMeta(publishable);
  console.log(`spotto API listening on http://${HOST}:${PORT}`);
  const fbOk = Boolean(getFirebaseAdmin());
  console.log(
    `  Firebase Admin: ${
      fbOk
        ? 'OK — /auth/firebase-ensure-claims 利用可'
        : `MISSING — ${getFirebaseAdminInitError()}`
    }`,
  );
  console.log(`  Stripe mode: ${mode} (EXPO_PUBLIC_STRIPE_MODE)`);
  console.log(
    `  STRIPE_SECRET_KEY_${mode.toUpperCase()}: ${
      secret
        ? `${skMeta.fingerprint || secret.slice(0, 7) + '…'} keyMode=${skMeta.mode || '?'}`
        : 'MISSING — /payments は 503 になります'
    }`,
  );
  console.log(
    `  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_${mode.toUpperCase()}: ${
      publishable
        ? `${pkMeta.fingerprint || publishable.slice(0, 7) + '…'} keyMode=${pkMeta.mode || '?'}`
        : '(empty — アプリ側 .env を確認)'
    }`,
  );
  if (skMeta.mode && skMeta.mode !== mode) {
    console.error(
      `  ⚠️ Secret Key がモードと不一致: EXPO_PUBLIC_STRIPE_MODE=${mode} key=${skMeta.mode}`,
    );
  }
  if (pkMeta.mode && pkMeta.mode !== mode) {
    console.error(
      `  ⚠️ Publishable Key がモードと不一致: EXPO_PUBLIC_STRIPE_MODE=${mode} key=${pkMeta.mode}`,
    );
  }
  if (
    skMeta.bodyPrefix &&
    pkMeta.bodyPrefix &&
    skMeta.bodyPrefix !== pkMeta.bodyPrefix
  ) {
    console.error(
      `  ⚠️ SK/PK の Stripe アカウントが不一致: secret=${skMeta.accountId} publishable=${pkMeta.accountId}`,
    );
  } else if (skMeta.mode && pkMeta.mode && skMeta.mode !== pkMeta.mode) {
    console.error(
      `  ⚠️ SK/PK のモード不一致: secret=${skMeta.mode} publishable=${pkMeta.mode}`,
    );
  } else if (skMeta.accountId && pkMeta.accountId) {
    console.log(`  SK/PK account match: ${skMeta.accountId} (${skMeta.mode})`);
  }
  console.log(
    `  実機向け: EXPO_PUBLIC_API_BASE_URL が localhost ならアプリが Expo の LAN IP に自動置換します`,
  );
  void (async () => {
    const account = await resolveStripeAccount(true);
    if (!account.ok) {
      console.error('  Stripe account: FAILED', account.error);
      return;
    }
    const dash =
      mode === 'live' || account.livemode || skMeta.mode === 'live'
        ? 'https://dashboard.stripe.com/payments'
        : 'https://dashboard.stripe.com/test/payments';
    console.log(
      `  Stripe account: ${account.id} (${account.email || 'no-email'}) country=${account.country} charges_enabled=${account.chargesEnabled} livemode=${account.livemode}`,
    );
    console.log(`  Dashboard (Payments): ${dash}`);
    console.log(
      '  ※ Test モードの決済は「Test mode」トグル ON の Payments に出ます（Live では見えません）',
    );
  })();
});
