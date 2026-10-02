import { Platform } from 'react-native';

import i18n from '@/lib/i18n';
import { resolveAuthUserId } from '@/lib/eventsRemote';
import { APP_DISPLAY_NAME, getAppVersion } from '@/lib/settings';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { getUserProfile, userDisplayName } from '@/lib/userProfile';

export type ReportTargetType = 'user' | 'event' | 'message' | 'other';

export type UserReport = {
  targetUserId: string;
  targetName: string;
  targetType?: ReportTargetType;
  reason: string;
  reportedAt: string;
  reporterUserId: string;
  reporterName: string;
};

export type SubmitReportResult =
  | { ok: true; channel: ReportChannel; reportId?: string }
  | { ok: false; error: string };

export type ReportChannel = 'supabase' | 'api' | 'slack' | 'console';

/** 通報完了メッセージ（呼び出し時に現在の言語で解決） */
export function getReportSuccessMessage() {
  return i18n.t('safety.reportSuccess');
}

const PLACEHOLDER_PREFIX = 'YOUR_';

function readEnv(name: string) {
  const value = process.env[name];
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith(PLACEHOLDER_PREFIX)) return '';
  return trimmed;
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function asTargetType(value: unknown): ReportTargetType {
  if (
    value === 'user' ||
    value === 'event' ||
    value === 'message' ||
    value === 'other'
  ) {
    return value;
  }
  return 'user';
}

export function getReportChannel(): ReportChannel {
  if (isSupabaseConfigured()) return 'supabase';
  const apiUrl = readEnv('EXPO_PUBLIC_REPORT_API_URL');
  const webhookUrl = readEnv('EXPO_PUBLIC_REPORT_WEBHOOK_URL');
  if (apiUrl && isHttpUrl(apiUrl)) return 'api';
  if (webhookUrl && isHttpUrl(webhookUrl)) return 'slack';
  return 'console';
}

function buildPayload(
  input: Omit<UserReport, 'reportedAt' | 'reporterUserId' | 'reporterName'> & {
    reportedAt?: string;
    reporterUserId?: string;
    reporterName?: string;
    targetType?: ReportTargetType;
  },
): UserReport {
  const profile = getUserProfile();
  return {
    targetUserId: String(input.targetUserId || '').trim(),
    targetName: String(input.targetName || '').trim(),
    targetType: asTargetType(input.targetType),
    reason: String(input.reason || '').trim(),
    reportedAt: input.reportedAt ?? new Date().toISOString(),
    reporterUserId: String(input.reporterUserId || '').trim() || 'guest',
    reporterName:
      String(input.reporterName || '').trim() ||
      userDisplayName(profile) ||
      'ゲスト',
  };
}

function slackBody(payload: UserReport) {
  const when = new Date(payload.reportedAt).toLocaleString('ja-JP', {
    hour12: false,
  });
  return {
    text: `${APP_DISPLAY_NAME} に新しい通報がありました`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${APP_DISPLAY_NAME} 通報`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*対象*\n${payload.targetName}` },
          { type: 'mrkdwn', text: `*対象ID*\n\`${payload.targetUserId}\`` },
          {
            type: 'mrkdwn',
            text: `*種別*\n${payload.targetType ?? 'user'}`,
          },
          { type: 'mrkdwn', text: `*通報者*\n${payload.reporterName}` },
          {
            type: 'mrkdwn',
            text: `*通報者ID*\n\`${payload.reporterUserId}\``,
          },
          { type: 'mrkdwn', text: `*送信日時*\n${when}` },
          {
            type: 'mrkdwn',
            text: `*環境*\n${Platform.OS} · v${getAppVersion()}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*理由*\n${payload.reason}`,
        },
      },
    ],
  };
}

async function postJson(url: string, body: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

function logReport(payload: UserReport, channel: ReportChannel) {
  if (!__DEV__) return;
  console.info(`[spotto report:${channel}]`, payload);
}

async function insertReportToSupabase(
  payload: UserReport,
): Promise<{ ok: true; reportId: string } | { ok: false; error: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: i18n.t('errors.reportDbUnavailable') };
  }

  let reporterId = payload.reporterUserId;
  if (!reporterId || reporterId === 'guest') {
    reporterId = (await resolveAuthUserId()) || '';
  }
  if (!reporterId) {
    return { ok: false, error: i18n.t('errors.reportLoginRequired') };
  }

  const row = {
    reporter_id: reporterId,
    target_id: payload.targetUserId,
    target_type: payload.targetType ?? 'user',
    target_name: payload.targetName,
    reason: payload.reason,
    status: 'open',
    created_at: payload.reportedAt,
  };

  const { data, error } = await client
    .from('reports')
    .insert(row)
    .select('id')
    .maybeSingle();

  if (error) {
    if (__DEV__) console.warn('[reports] insert failed', error);
    const message = error.message || '';
    if (
      message.includes('schema cache') ||
      message.includes('Could not find the table') ||
      error.code === 'PGRST205' ||
      error.code === '42P01'
    ) {
      return {
        ok: false,
        error: i18n.t('errors.reportTableMissing'),
      };
    }
    return {
      ok: false,
      error: i18n.t('errors.reportSaveFailed'),
    };
  }

  return {
    ok: true,
    reportId: String((data as { id?: string } | null)?.id || ''),
  };
}

/** 補助通知（失敗しても通報本体の成功は維持） */
async function notifyReportSideChannels(payload: UserReport) {
  const apiUrl = readEnv('EXPO_PUBLIC_REPORT_API_URL');
  const webhookUrl = readEnv('EXPO_PUBLIC_REPORT_WEBHOOK_URL');
  try {
    if (apiUrl && isHttpUrl(apiUrl)) {
      await postJson(apiUrl, payload);
      return;
    }
    if (webhookUrl && isHttpUrl(webhookUrl)) {
      await postJson(webhookUrl, slackBody(payload));
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[reports] side notify failed', error);
    }
  }
}

/**
 * 通報を保存する。
 * 優先: Supabase `reports` へ INSERT。
 * 任意: API / Slack Webhook へも通知（失敗しても DB 保存成功なら ok）。
 */
export async function submitUserReport(
  input: Omit<UserReport, 'reportedAt' | 'reporterUserId' | 'reporterName'> & {
    reportedAt?: string;
    reporterUserId?: string;
    reporterName?: string;
    targetType?: ReportTargetType;
  },
): Promise<SubmitReportResult> {
  const authUserId = await resolveAuthUserId();
  const profile = getUserProfile();
  const payload = buildPayload({
    ...input,
    reporterUserId: input.reporterUserId || authUserId || undefined,
    reporterName: input.reporterName || userDisplayName(profile) || undefined,
  });

  if (!payload.targetUserId || !payload.reason) {
    return { ok: false, error: i18n.t('errors.reportMissingFields') };
  }
  if (
    payload.targetType === 'user' &&
    authUserId &&
    payload.targetUserId === authUserId
  ) {
    return { ok: false, error: i18n.t('errors.reportSelf') };
  }

  const channel = getReportChannel();
  logReport(payload, channel);

  try {
    if (channel === 'supabase') {
      const inserted = await insertReportToSupabase(payload);
      if (!inserted.ok) {
        return { ok: false, error: inserted.error };
      }
      void notifyReportSideChannels({
        ...payload,
        reporterUserId: authUserId || payload.reporterUserId,
      });
      return {
        ok: true,
        channel: 'supabase',
        reportId: inserted.reportId || undefined,
      };
    }

    if (channel === 'api') {
      await postJson(readEnv('EXPO_PUBLIC_REPORT_API_URL'), payload);
      return { ok: true, channel };
    }
    if (channel === 'slack') {
      await postJson(
        readEnv('EXPO_PUBLIC_REPORT_WEBHOOK_URL'),
        slackBody(payload),
      );
      return { ok: true, channel };
    }

    await new Promise((resolve) => setTimeout(resolve, 450));
    return { ok: true, channel };
  } catch (error) {
    if (__DEV__) {
      console.warn('[spotto report] send failed', error);
    }
    return {
      ok: false,
      error: i18n.t('errors.reportSendFailed'),
    };
  }
}
