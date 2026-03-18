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

// ── User management ───────────────────────────────────────────────────────────

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
