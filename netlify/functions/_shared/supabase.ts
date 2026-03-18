import { createClient } from '@supabase/supabase-js';
import type { PromptSubmission } from './types.js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://njwzbptrhgznozpndcxf.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabase() {
  if (!supabaseKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(supabaseUrl, supabaseKey);
}

export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_, prop) {
    return (getSupabase() as any)[prop];
  },
});

// ── Migrations ────────────────────────────────────────────────────────────────
// Tables are managed via Supabase dashboard / migrations. This is a no-op kept
// for backward compatibility so callers that call migrateDb() don't break.

export async function migrateDb() {
  // No-op — schema is managed in Supabase directly.
  // Keeping the function signature so existing callers don't break.
}

// ── User management ───────────────────────────────────────────────────────────

export async function upsertUser(userId: string, email: string | null, orgDomain: string | null) {
  const sb = getSupabase();

  // Claim a pre-registered row if one exists for this email
  if (email) {
    const { data: pre } = await sb
      .from('app_users')
      .select('user_id')
      .eq('user_email', email)
      .eq('user_id', 'pre:' + email);

    if (pre && pre.length > 0) {
      await sb
        .from('app_users')
        .update({ user_id: userId, updated_at: new Date().toISOString() })
        .eq('user_id', 'pre:' + email);
      return;
    }
  }

  const isAiDigital = email?.toLowerCase().endsWith('@aidigital.com') ?? false;
  const initialStatus = isAiDigital ? 'active' : 'trial';

  await sb.from('app_users').upsert(
    {
      user_id: userId,
      user_email: email,
      org_domain: orgDomain,
      status: initialStatus,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  // Preserve existing org_domain if already set
  if (orgDomain === null) {
    await sb
      .from('app_users')
      .update({ updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .not('org_domain', 'is', null);
  }
}

export async function getUserStatus(userId: string) {
  const sb = getSupabase();
  const { data } = await sb.from('app_users').select('*').eq('user_id', userId).maybeSingle();
  return data ?? null;
}

export async function incrementUserSessionCount(userId: string) {
  const sb = getSupabase();
  const { data: row } = await sb
    .from('app_users')
    .select('audit_count, status')
    .eq('user_id', userId)
    .maybeSingle();

  if (!row) return;

  const newCount = (row.audit_count ?? 0) + 1;
  let newStatus = row.status;
  if (row.status === 'trial' && newCount >= 10) {
    newStatus = 'pending';
  }

  await sb
    .from('app_users')
    .update({ audit_count: newCount, status: newStatus, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
}

export async function adminSetUserStatus(userId: string, status: string) {
  const sb = getSupabase();
  if (status === 'admin') {
    await sb
      .from('app_users')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .ilike('user_email', '%@aidigital.com');
  } else {
    await sb
      .from('app_users')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
  }
}

export async function adminSetOrgStatus(orgDomain: string, status: string) {
  const sb = getSupabase();
  await sb
    .from('app_users')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('org_domain', orgDomain);
}

// ── Session management ────────────────────────────────────────────────────────

export async function createSession(params: {
  id: string;
  userId: string;
  userEmail: string | null;
  promptTitle?: string | null;
  submission?: PromptSubmission | null;
  status?: string;
  messages?: Array<{ role: string; content: string }>;
}) {
  const sb = getSupabase();
  await sb.from('pe_sessions').upsert(
    {
      id: params.id,
      user_id: params.userId,
      user_email: params.userEmail,
      prompt_title: params.promptTitle ?? null,
      submission: params.submission ?? null,
      status: params.status ?? 'chatting',
      messages: params.messages ?? [],
    },
    { onConflict: 'id', ignoreDuplicates: true }
  );
}

export async function updateSessionSubmission(
  id: string,
  submission: PromptSubmission,
  promptTitle: string,
  messages: Array<{ role: string; content: string }>
) {
  const sb = getSupabase();
  await sb
    .from('pe_sessions')
    .update({
      submission,
      prompt_title: promptTitle,
      messages,
      status: 'pending',
    })
    .eq('id', id);
}

export async function updateSessionReport(
  id: string,
  report: string,
  status: 'complete' | 'error',
  error?: string
) {
  const sb = getSupabase();
  await sb
    .from('pe_sessions')
    .update({
      report,
      status,
      error: error ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id);
}

export async function updateSessionMessages(
  id: string,
  messages: Array<{ role: string; content: string }>
) {
  const sb = getSupabase();
  await sb.from('pe_sessions').update({ messages }).eq('id', id);
}

export async function softDeleteSession(id: string, userId: string) {
  const sb = getSupabase();
  await sb
    .from('pe_sessions')
    .update({ deleted_by_user: true })
    .eq('id', id)
    .eq('user_id', userId);
}

// ── User queries ──────────────────────────────────────────────────────────────

export async function listUserSessions(userId: string) {
  const sb = getSupabase();
  const { data } = await sb
    .from('pe_sessions')
    .select('id, prompt_title, status, created_at, completed_at')
    .eq('user_id', userId)
    .or('deleted_by_user.is.null,deleted_by_user.eq.false')
    .order('created_at', { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function getSession(id: string, userId: string) {
  const sb = getSupabase();
  const { data } = await sb
    .from('pe_sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? null;
}

// ── Admin queries ─────────────────────────────────────────────────────────────

export async function adminListAccounts() {
  const sb = getSupabase();
  const { data } = await sb.rpc('admin_list_accounts');
  if (data) return data;
  return [];
}

export async function adminListUsers(domain?: string) {
  const sb = getSupabase();
  if (domain) {
    const { data } = await sb.rpc('admin_list_users_by_domain', { p_domain: domain });
    return data ?? [];
  }
  const { data } = await sb.rpc('admin_list_users');
  return data ?? [];
}

export async function adminGetUserSessions(userId: string) {
  const sb = getSupabase();
  const { data } = await sb
    .from('pe_sessions')
    .select('id, prompt_title, status, created_at, completed_at, deleted_by_user')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

export async function adminGetSession(id: string) {
  const sb = getSupabase();
  const { data } = await sb.from('pe_sessions').select('*').eq('id', id).maybeSingle();
  return data ?? null;
}

// ── Sharing ──────────────────────────────────────────────────────────────────

export async function saveReportData(id: string, reportData: unknown) {
  const sb = getSupabase();
  await sb
    .from('pe_sessions')
    .update({ report_data: reportData })
    .eq('id', id);
}

export async function setSessionShare(id: string, userId: string, isPublic: boolean) {
  const sb = getSupabase();
  const { data: existing } = await sb
    .from('pe_sessions')
    .select('share_token')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  const shareToken = existing?.share_token || crypto.randomUUID();

  await sb
    .from('pe_sessions')
    .update({ share_token: shareToken, is_public: isPublic })
    .eq('id', id)
    .eq('user_id', userId);

  return { share_token: shareToken, is_public: isPublic };
}

export async function getSessionByShareToken(token: string) {
  const sb = getSupabase();
  const { data } = await sb
    .from('pe_sessions')
    .select('id, prompt_title, report, report_data, is_public, submission')
    .eq('share_token', token)
    .maybeSingle();
  return data ?? null;
}

export async function adminGetSessionShare(id: string) {
  const sb = getSupabase();
  const { data } = await sb
    .from('pe_sessions')
    .select('share_token, is_public')
    .eq('id', id)
    .maybeSingle();
  return data ?? null;
}
