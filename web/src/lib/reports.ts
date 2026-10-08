import { createAuthedSupabase } from '@/lib/supabase';

export type ReportTargetType = 'user' | 'event' | 'message' | 'other';

export const REPORT_REASON_PRESETS = [
  '不適切な言動',
  'スパム',
  '迷惑行為',
  'なりすまし',
  'その他',
] as const;

export async function submitUserReport(input: {
  reporterId: string;
  reporterName?: string;
  targetUserId: string;
  targetName: string;
  targetType?: ReportTargetType;
  reason: string;
  getIdToken: () => Promise<string | null>;
}): Promise<{ ok: true; reportId?: string } | { ok: false; error: string }> {
  const reporterId = input.reporterId.trim();
  const targetId = input.targetUserId.trim();
  const reason = input.reason.trim();
  if (!reporterId) return { ok: false, error: 'ログインが必要です' };
  if (!targetId) return { ok: false, error: '通報対象が不正です' };
  if (targetId === reporterId) {
    return { ok: false, error: '自分自身は通報できません' };
  }
  if (!reason) return { ok: false, error: '通報理由を入力してください' };
  if (reason.length > 2000) {
    return { ok: false, error: '通報理由が長すぎます' };
  }

  try {
    const supabase = createAuthedSupabase(input.getIdToken);
    const { data, error } = await supabase
      .from('reports')
      .insert({
        reporter_id: reporterId,
        target_id: targetId,
        target_type: input.targetType ?? 'user',
        target_name: input.targetName.trim() || 'ユーザー',
        reason,
        status: 'open',
      })
      .select('id')
      .maybeSingle();

    if (error) {
      if (
        error.message.includes('schema cache') ||
        error.message.includes('Could not find the table') ||
        error.code === 'PGRST205' ||
        error.code === '42P01'
      ) {
        return {
          ok: false,
          error: '通報テーブルが未作成です。運営にお問い合わせください。',
        };
      }
      return { ok: false, error: error.message || '通報の送信に失敗しました' };
    }

    return {
      ok: true,
      reportId: String((data as { id?: string } | null)?.id || '') || undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '通報の送信に失敗しました',
    };
  }
}
