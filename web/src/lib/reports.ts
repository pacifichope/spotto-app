import { createAuthedSupabase } from '@/lib/supabase';

export type ReportTargetType = 'user' | 'event' | 'message' | 'other';

export const REPORT_REASON_KEYS = [
  'safety.reasonInappropriate',
  'safety.reasonSpam',
  'safety.reasonHarassment',
  'safety.reasonImpersonation',
  'safety.reasonOther',
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
  if (!reporterId) return { ok: false, error: 'errors.loginRequired' };
  if (!targetId) return { ok: false, error: 'errors.invalidTarget' };
  if (targetId === reporterId) {
    return { ok: false, error: 'errors.cannotReportSelf' };
  }
  if (!reason) return { ok: false, error: 'errors.reportReasonRequired' };
  if (reason.length > 2000) {
    return { ok: false, error: 'errors.reportTooLong' };
  }

  try {
    const supabase = createAuthedSupabase(input.getIdToken);
    const { data, error } = await supabase
      .from('reports')
      .insert({
        reporter_id: reporterId,
        target_id: targetId,
        target_type: input.targetType ?? 'user',
        target_name: input.targetName.trim() || 'user',
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
          error: 'errors.reportTableMissing',
        };
      }
      return { ok: false, error: error.message || 'errors.reportFailed' };
    }

    return {
      ok: true,
      reportId: String((data as { id?: string } | null)?.id || '') || undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'errors.reportFailed',
    };
  }
}
