// Supabase Edge Function: delete-account
// Deploy: supabase functions deploy delete-account
// Secrets: SUPABASE_SERVICE_ROLE_KEY はプロジェクトに自動注入される想定
//
// クライアント: supabase.functions.invoke('delete-account')
// または Authorization: Bearer <access_token> で POST

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'method not allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(500, { ok: false, error: 'server misconfigured' });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json(401, { ok: false, error: 'missing authorization' });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user?.id) {
    return json(401, { ok: false, error: 'unauthorized' });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 関連 public データを先に掃除（FK CASCADE もあるが明示削除）
  await admin.from('chat_messages').delete().or(
    `sender_id.eq.${user.id},dm_user_id.eq.${user.id}`,
  );
  await admin.from('event_favorites').delete().eq('user_id', user.id);
  await admin.from('event_watchlist').delete().eq('user_id', user.id);
  await admin.from('event_participants').delete().eq('user_id', user.id);
  await admin.from('device_push_tokens').delete().eq('user_id', user.id);
  await admin.from('events').delete().eq('host_id', user.id);
  await admin.from('blocks').delete().or(
    `blocker_id.eq.${user.id},blocked_id.eq.${user.id}`,
  );
  await admin.from('profiles').delete().eq('id', user.id);

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('[delete-account]', deleteError.message);
    return json(500, {
      ok: false,
      error: deleteError.message || 'failed to delete auth user',
    });
  }

  return json(200, { ok: true, userId: user.id });
});
