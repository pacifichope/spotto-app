// Supabase Edge Function: notify-payout-paid
// Deploy:
//   supabase functions deploy notify-payout-paid --no-verify-jwt
// Secrets (Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY / RESEND_FROM_EMAIL / RESEND_FROM_NAME
//   または SENDGRID_API_KEY / SENDGRID_FROM_EMAIL / SENDGRID_FROM_NAME
//   PAYOUT_NOTIFY_SECRET（任意・推奨。Webhook / サーバー呼び出しの共有秘密）
//
// トリガー:
//   1) organizer_payouts が pending→paid になった DB トリガー (pg_net)
//   2) Database Webhook（手動設定）
//   3) 運営 API からのフォールバック呼び出し
//
// Body 例:
//   { "record": { "id": "...", "host_id": "...", "year_month": "2026-09", ... } }
//   { "type": "UPDATE", "table": "organizer_payouts", "record": {...}, "old_record": {...} }
//   { "payoutId": "uuid" } / { "hostId": "uuid", "yearMonth": "2026-09" }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-spotto-notify-secret',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function env(name: string) {
  return (Deno.env.get(name) || '').trim();
}

function yen(n: number) {
  return `${Math.max(0, Math.floor(n || 0)).toLocaleString('ja-JP')}円`;
}

function monthLabel(yearMonth: string) {
  const [y, m] = String(yearMonth || '').split('-');
  if (y && m) return `${Number(y)}年${Number(m)}月分`;
  return String(yearMonth || '');
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function accountTypeLabel(type: string) {
  return type === 'checking' ? '当座' : '普通';
}

function maskAccountNumber(raw: string) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  return `${'*'.repeat(Math.max(0, digits.length - 3))}${digits.slice(-3)}`;
}

type PayoutRow = {
  id: string;
  host_id: string;
  year_month: string;
  status: string;
  gross_yen: number;
  platform_fee_yen: number;
  payout_fee_yen: number;
  net_yen: number;
  notified_at?: string | null;
};

function buildPayoutEmail(input: {
  toName: string;
  yearMonth: string;
  grossYen: number;
  platformFeeYen: number;
  payoutFeeYen: number;
  netYen: number;
  bank: {
    bankName: string;
    branchName: string;
    branchNumber: string;
    accountType: string;
    accountNumber: string;
    accountHolderKana: string;
  } | null;
}) {
  const label = monthLabel(input.yearMonth);
  const bankLines = input.bank
    ? [
        `銀行名: ${input.bank.bankName}`,
        `支店名 / 支店番号: ${input.bank.branchName}（${input.bank.branchNumber || '—'}）`,
        `口座種別: ${accountTypeLabel(input.bank.accountType)}`,
        `口座番号: ${maskAccountNumber(input.bank.accountNumber)}`,
        `口座名義: ${input.bank.accountHolderKana}`,
      ]
    : ['（振込時点で口座情報が取得できませんでした。アプリの振込口座画面をご確認ください）'];

  const subject = `【spotto】${label}の売上金の振込が完了しました`;
  const text = [
    `${input.toName} さん`,
    '',
    `${label}の売上金を、ご登録の口座にお振り込みいたしました。`,
    '',
    '■ 振込内容',
    `売上総額: ${yen(input.grossYen)}`,
    `プラットフォーム利用料（10%）: −${yen(input.platformFeeYen)}`,
    `振込手数料: −${yen(input.payoutFeeYen)}`,
    `手取り額（振込金額）: ${yen(input.netYen)}`,
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

  const html = `
    <div style="font-family:sans-serif;line-height:1.6;color:#12202A">
      <p>${input.toName} さん</p>
      <p>${label}の売上金を、ご登録の口座にお振り込みいたしました。</p>
      <h3 style="margin-bottom:8px">振込内容</h3>
      <ul>
        <li>売上総額: ${yen(input.grossYen)}</li>
        <li>プラットフォーム利用料（10%）: −${yen(input.platformFeeYen)}</li>
        <li>振込手数料: −${yen(input.payoutFeeYen)}</li>
        <li><strong>手取り額（振込金額）: ${yen(input.netYen)}</strong></li>
      </ul>
      <h3 style="margin-bottom:8px">振込先口座</h3>
      <ul>${bankLines.map((line) => `<li>${line}</li>`).join('')}</ul>
      <h3 style="margin-bottom:8px">注意事項</h3>
      <ul>
        <li>口座への反映は、金融機関により1〜2営業日程度かかる場合があります。</li>
        <li>金額や口座に相違がある場合は、アプリ内「お問い合わせ」よりご連絡ください。</li>
        <li>詳細はマイページ「売上管理」でもご確認いただけます。</li>
      </ul>
      <p>spotto 運営</p>
    </div>
  `.trim();

  return { subject, text, html };
}

async function sendResend(options: {
  to: string;
  toName: string;
  subject: string;
  text: string;
  html: string;
}) {
  const apiKey = env('RESEND_API_KEY');
  const from =
    env('RESEND_FROM_EMAIL') ||
    env('SENDGRID_FROM_EMAIL') ||
    'noreply@spotto.fun';
  const fromName = env('RESEND_FROM_NAME') || env('SENDGRID_FROM_NAME') || 'spotto';
  if (!apiKey) return { skipped: true as const, provider: 'resend' };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${from}>`,
      to: [options.toName ? `${options.toName} <${options.to}>` : options.to],
      subject: options.subject,
      text: options.text,
      html: options.html,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend ${response.status}: ${detail.slice(0, 240)}`);
  }
  const data = await response.json().catch(() => ({}));
  return { skipped: false as const, provider: 'resend', id: data?.id || '' };
}

async function sendSendGrid(options: {
  to: string;
  toName: string;
  subject: string;
  text: string;
  html: string;
}) {
  const apiKey = env('SENDGRID_API_KEY');
  const from =
    env('SENDGRID_FROM_EMAIL') ||
    env('RESEND_FROM_EMAIL') ||
    'noreply@spotto.fun';
  const fromName = env('SENDGRID_FROM_NAME') || env('RESEND_FROM_NAME') || 'spotto';
  if (!apiKey) return { skipped: true as const, provider: 'sendgrid' };

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        { to: [{ email: options.to, name: options.toName || undefined }] },
      ],
      from: { email: from, name: fromName },
      subject: options.subject,
      content: [
        { type: 'text/plain', value: options.text },
        { type: 'text/html', value: options.html },
      ],
    }),
  });
  if (!response.ok && response.status !== 202) {
    const detail = await response.text();
    throw new Error(`SendGrid ${response.status}: ${detail.slice(0, 200)}`);
  }
  return { skipped: false as const, provider: 'sendgrid' };
}

async function sendMail(options: {
  to: string;
  toName: string;
  subject: string;
  text: string;
  html: string;
}) {
  if (env('RESEND_API_KEY')) {
    const result = await sendResend(options);
    if (!result.skipped) return result;
  }
  if (env('SENDGRID_API_KEY')) {
    const result = await sendSendGrid(options);
    if (!result.skipped) return result;
  }
  console.info('[notify-payout-paid:mail:console]', {
    to: options.to,
    subject: options.subject,
    text: options.text,
  });
  return { skipped: true as const, provider: 'none' };
}

async function sendExpoPush(input: {
  tokens: string[];
  title: string;
  body: string;
  data: Record<string, unknown>;
}) {
  if (input.tokens.length === 0) return { sent: 0 };
  const messages = input.tokens.map((to) => ({
    to,
    sound: 'default',
    title: input.title,
    body: input.body,
    data: input.data,
  }));
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.warn('[notify-payout-paid:push]', response.status, body);
    throw new Error('expo push failed');
  }
  return { sent: input.tokens.length };
}

function authorize(req: Request) {
  const secret = env('PAYOUT_NOTIFY_SECRET');
  if (!secret) return true;
  const header = req.headers.get('x-spotto-notify-secret') || '';
  const auth = req.headers.get('Authorization') || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
  return header === secret || bearer === secret;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'method not allowed' });
  }
  if (!authorize(req)) {
    return json(401, { ok: false, error: 'unauthorized' });
  }

  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, error: 'server misconfigured' });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const record =
    (body.record as Record<string, unknown> | undefined) ||
    (body.new as Record<string, unknown> | undefined) ||
    null;
  const oldRecord =
    (body.old_record as Record<string, unknown> | undefined) ||
    (body.old as Record<string, unknown> | undefined) ||
    null;

  // Webhook で status が paid 以外 / 既に paid→paid の場合はスキップ
  if (record && body.type === 'UPDATE') {
    const nextStatus = String(record.status || '');
    const prevStatus = String(oldRecord?.status || '');
    if (nextStatus !== 'paid' || prevStatus === 'paid') {
      return json(200, { ok: true, skipped: true, reason: 'not a new paid status' });
    }
  }

  let payout: PayoutRow | null = null;

  const payoutId = String(
    body.payoutId || record?.id || body.id || '',
  ).trim();
  const hostId = String(
    body.hostId || record?.host_id || '',
  ).trim();
  const yearMonth = String(
    body.yearMonth || record?.year_month || '',
  ).trim();

  if (payoutId) {
    const { data, error } = await admin
      .from('organizer_payouts')
      .select(
        'id,host_id,year_month,status,gross_yen,platform_fee_yen,payout_fee_yen,net_yen,notified_at',
      )
      .eq('id', payoutId)
      .maybeSingle();
    if (error) {
      return json(500, { ok: false, error: error.message });
    }
    payout = data as PayoutRow | null;
  } else if (hostId && yearMonth) {
    const { data, error } = await admin
      .from('organizer_payouts')
      .select(
        'id,host_id,year_month,status,gross_yen,platform_fee_yen,payout_fee_yen,net_yen,notified_at',
      )
      .eq('host_id', hostId)
      .eq('year_month', yearMonth)
      .maybeSingle();
    if (error) {
      return json(500, { ok: false, error: error.message });
    }
    payout = data as PayoutRow | null;
  }

  if (!payout) {
    return json(404, { ok: false, error: 'payout not found' });
  }
  if (payout.status !== 'paid') {
    return json(200, { ok: true, skipped: true, reason: 'status is not paid' });
  }
  if (payout.notified_at) {
    return json(200, {
      ok: true,
      skipped: true,
      reason: 'already notified',
      notifiedAt: payout.notified_at,
    });
  }

  // ロック相当: 先に notified_at を仮セット（二重送信防止）
  const lockIso = new Date().toISOString();
  const { data: locked, error: lockError } = await admin
    .from('organizer_payouts')
    .update({ notified_at: lockIso })
    .eq('id', payout.id)
    .is('notified_at', null)
    .eq('status', 'paid')
    .select('id')
    .maybeSingle();
  if (lockError) {
    return json(500, { ok: false, error: lockError.message });
  }
  if (!locked) {
    return json(200, { ok: true, skipped: true, reason: 'already claimed' });
  }

  let toEmail = '';
  let toName = '主催者';

  // 口座の通知用メールを優先（Auth 登録メールは使わない）
  const { data: bank } = await admin
    .from('organizer_bank_accounts')
    .select(
      'bank_name,branch_name,branch_number,account_type,account_number,account_holder_kana,notify_email',
    )
    .eq('user_id', payout.host_id)
    .maybeSingle();

  toEmail = String(bank?.notify_email || '').trim().toLowerCase();

  try {
    const { data: userData, error: userError } =
      await admin.auth.admin.getUserById(payout.host_id);
    if (!userError && userData?.user) {
      const meta = (userData.user.user_metadata || {}) as Record<string, unknown>;
      toName =
        String(meta.display_name || meta.full_name || meta.name || '').trim() ||
        toName;
    }
  } catch (error) {
    console.warn('[notify-payout-paid] getUserById', error);
  }

  if (toName === '主催者') {
    const { data: profile } = await admin
      .from('profiles')
      .select('display_name,nickname')
      .eq('id', payout.host_id)
      .maybeSingle();
    toName =
      String(profile?.display_name || profile?.nickname || '').trim() || toName;
  }

  const mail = buildPayoutEmail({
    toName,
    yearMonth: payout.year_month,
    grossYen: Number(payout.gross_yen) || 0,
    platformFeeYen: Number(payout.platform_fee_yen) || 0,
    payoutFeeYen: Number(payout.payout_fee_yen) || 0,
    netYen: Number(payout.net_yen) || 0,
    bank: bank
      ? {
          bankName: String(bank.bank_name || ''),
          branchName: String(bank.branch_name || ''),
          branchNumber: String(bank.branch_number || ''),
          accountType: String(bank.account_type || 'ordinary'),
          accountNumber: String(bank.account_number || ''),
          accountHolderKana: String(bank.account_holder_kana || ''),
        }
      : null,
  });

  let emailed = false;
  let mailProvider = 'none';
  if (toEmail && isValidEmail(toEmail) && !toEmail.endsWith('@users.spotto.local')) {
    try {
      const mailResult = await sendMail({
        to: toEmail,
        toName,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
      emailed = !mailResult.skipped;
      mailProvider = mailResult.provider;
    } catch (error) {
      console.error('[notify-payout-paid] mail failed', error);
      // 失敗時は再送できるようロック解除
      await admin
        .from('organizer_payouts')
        .update({ notified_at: null })
        .eq('id', payout.id);
      return json(502, {
        ok: false,
        error: error instanceof Error ? error.message : 'mail failed',
      });
    }
  } else {
    console.info('[notify-payout-paid] no notify_email on bank account', {
      hostId: payout.host_id,
      yearMonth: payout.year_month,
    });
  }

  const { data: tokenRows } = await admin
    .from('device_push_tokens')
    .select('token')
    .eq('user_id', payout.host_id);
  const tokens = [
    ...new Set(
      (tokenRows || [])
        .map((row) => String(row?.token || '').trim())
        .filter(Boolean),
    ),
  ];

  let pushed = 0;
  try {
    const pushResult = await sendExpoPush({
      tokens,
      title: '【spotto】売上金の振込が完了しました',
      body:
        '対象月の売上金をご登録の口座にお振り込みいたしました。詳細はマイページよりご確認ください。',
      data: {
        kind: 'payout_paid',
        yearMonth: payout.year_month,
        screen: 'sales',
      },
    });
    pushed = pushResult.sent;
  } catch (error) {
    console.warn('[notify-payout-paid] push failed', error);
  }

  return json(200, {
    ok: true,
    emailed,
    mailProvider,
    pushed,
    payoutId: payout.id,
    yearMonth: payout.year_month,
    hostId: payout.host_id,
  });
});
