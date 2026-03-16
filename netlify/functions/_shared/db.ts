import { neon } from '@neondatabase/serverless';
import type { PromptSubmission } from './types.js';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not configured');
  return neon(url);
}

// ── Migrations ────────────────────────────────────────────────────────────────

export async function migrateDb() {
  const sql = getDb();

  // Shared user table (same as neuromarketing app)
  await sql`
    CREATE TABLE IF NOT EXISTS app_users (
      user_id     TEXT PRIMARY KEY,
      user_email  TEXT,
      org_domain  TEXT,
      status      TEXT NOT NULL DEFAULT 'trial',
      audit_count INTEGER NOT NULL DEFAULT 0,
      notes       TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Prompt Engineering sessions (pe_ prefix)
  await sql`
    CREATE TABLE IF NOT EXISTS pe_sessions (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      user_email      TEXT,
      prompt_title    TEXT,
      submission      JSONB,
      report          TEXT,
      status          TEXT DEFAULT 'chatting',
      error           TEXT,
      messages        JSONB DEFAULT '[]',
      deleted_by_user BOOLEAN DEFAULT FALSE,
      report_data     JSONB,
      share_token     TEXT,
      is_public       BOOLEAN DEFAULT FALSE,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      completed_at    TIMESTAMPTZ
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS pe_sessions_user_id_idx    ON pe_sessions(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS pe_sessions_user_email_idx ON pe_sessions(user_email)`;
  await sql`CREATE INDEX IF NOT EXISTS pe_sessions_created_at_idx ON pe_sessions(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS app_users_org_domain_idx   ON app_users(org_domain)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS pe_sessions_share_token_idx ON pe_sessions(share_token) WHERE share_token IS NOT NULL`;
}

// ── User management (shared with neuromarketing) ─────────────────────────────

export async function upsertUser(userId: string, email: string | null, orgDomain: string | null) {
  const sql = getDb();

  if (email) {
    const pre = await sql`
      SELECT user_id FROM app_users WHERE user_email = ${email} AND user_id = ${'pre:' + email}
    `;
    if (pre.length > 0) {
      await sql`
        UPDATE app_users
        SET user_id = ${userId}, updated_at = NOW()
        WHERE user_id = ${'pre:' + email}
      `;
      return;
    }
  }

  const isAiDigital = email?.toLowerCase().endsWith('@aidigital.com') ?? false;
  const initialStatus = isAiDigital ? 'active' : 'trial';
  await sql`
    INSERT INTO app_users (user_id, user_email, org_domain, status)
    VALUES (${userId}, ${email}, ${orgDomain}, ${initialStatus})
    ON CONFLICT (user_id) DO UPDATE
      SET user_email = EXCLUDED.user_email,
          org_domain = COALESCE(app_users.org_domain, EXCLUDED.org_domain),
          updated_at = NOW()
  `;
}

export async function getUserStatus(userId: string) {
  const sql = getDb();
  const rows = await sql`SELECT * FROM app_users WHERE user_id = ${userId}`;
  return rows[0] ?? null;
}

export async function incrementUserSessionCount(userId: string) {
  const sql = getDb();
  await sql`
    UPDATE app_users
    SET audit_count = audit_count + 1,
        status = CASE
          WHEN status = 'trial' AND audit_count + 1 >= 10 THEN 'pending'
          ELSE status
        END,
        updated_at = NOW()
    WHERE user_id = ${userId}
  `;
}

export async function adminSetUserStatus(userId: string, status: string) {
  const sql = getDb();
  if (status === 'admin') {
    await sql`
      UPDATE app_users SET status = ${status}, updated_at = NOW()
      WHERE user_id = ${userId} AND user_email ILIKE '%@aidigital.com'
    `;
  } else {
    await sql`UPDATE app_users SET status = ${status}, updated_at = NOW() WHERE user_id = ${userId}`;
  }
}

export async function adminSetOrgStatus(orgDomain: string, status: string) {
  const sql = getDb();
  await sql`UPDATE app_users SET status = ${status}, updated_at = NOW() WHERE org_domain = ${orgDomain}`;
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
  const sql = getDb();
  await sql`
    INSERT INTO pe_sessions (id, user_id, user_email, prompt_title, submission, status, messages)
    VALUES (
      ${params.id}, ${params.userId}, ${params.userEmail},
      ${params.promptTitle ?? null},
      ${JSON.stringify(params.submission ?? null)},
      ${params.status ?? 'chatting'},
      ${JSON.stringify(params.messages ?? [])}
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function updateSessionSubmission(
  id: string,
  submission: PromptSubmission,
  promptTitle: string,
  messages: Array<{ role: string; content: string }>
) {
  const sql = getDb();
  await sql`
    UPDATE pe_sessions
    SET submission    = ${JSON.stringify(submission)},
        prompt_title  = ${promptTitle},
        messages      = ${JSON.stringify(messages)},
        status        = 'pending'
    WHERE id = ${id}
  `;
}

export async function updateSessionReport(
  id: string,
  report: string,
  status: 'complete' | 'error',
  error?: string
) {
  const sql = getDb();
  await sql`
    UPDATE pe_sessions
    SET report = ${report}, status = ${status}, error = ${error ?? null}, completed_at = NOW()
    WHERE id = ${id}
  `;
}

export async function updateSessionMessages(
  id: string,
  messages: Array<{ role: string; content: string }>
) {
  const sql = getDb();
  await sql`UPDATE pe_sessions SET messages = ${JSON.stringify(messages)} WHERE id = ${id}`;
}

export async function softDeleteSession(id: string, userId: string) {
  const sql = getDb();
  await sql`UPDATE pe_sessions SET deleted_by_user = TRUE WHERE id = ${id} AND user_id = ${userId}`;
}

// ── User queries ──────────────────────────────────────────────────────────────

export async function listUserSessions(userId: string) {
  const sql = getDb();
  return await sql`
    SELECT id, prompt_title, status, created_at, completed_at
    FROM pe_sessions
    WHERE user_id = ${userId}
      AND (deleted_by_user IS NULL OR deleted_by_user = FALSE)
    ORDER BY created_at DESC
    LIMIT 100
  `;
}

export async function getSession(id: string, userId: string) {
  const sql = getDb();
  const rows = await sql`SELECT * FROM pe_sessions WHERE id = ${id} AND user_id = ${userId}`;
  return rows[0] ?? null;
}

// ── Admin queries ─────────────────────────────────────────────────────────────

export async function adminListAccounts() {
  const sql = getDb();
  return await sql`
    SELECT
      u.org_domain                            AS domain,
      COUNT(DISTINCT u.user_id)               AS user_count,
      COUNT(s.id)                             AS session_count,
      MAX(s.created_at)                       AS last_activity
    FROM app_users u
    LEFT JOIN pe_sessions s ON s.user_id = u.user_id
    WHERE u.org_domain IS NOT NULL
    GROUP BY u.org_domain
    ORDER BY last_activity DESC NULLS LAST
  `;
}

export async function adminListUsers(domain?: string) {
  const sql = getDb();
  if (domain) {
    return await sql`
      SELECT
        u.user_id, u.user_email, u.status, u.audit_count,
        MAX(s.created_at) AS last_activity,
        COUNT(s.id) AS session_count
      FROM app_users u
      LEFT JOIN pe_sessions s ON s.user_id = u.user_id
      WHERE u.org_domain = ${domain}
         OR u.user_email LIKE ${'%@' + domain}
      GROUP BY u.user_id, u.user_email, u.status, u.audit_count
      ORDER BY last_activity DESC NULLS LAST
    `;
  }
  return await sql`
    SELECT u.user_id, u.user_email, u.status, u.audit_count,
           MAX(s.created_at) AS last_activity
    FROM app_users u
    LEFT JOIN pe_sessions s ON s.user_id = u.user_id
    GROUP BY u.user_id, u.user_email, u.status, u.audit_count
    ORDER BY last_activity DESC NULLS LAST
    LIMIT 500
  `;
}

export async function adminGetUserSessions(userId: string) {
  const sql = getDb();
  return await sql`
    SELECT id, prompt_title, status, created_at, completed_at, deleted_by_user
    FROM pe_sessions
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
}

export async function adminGetSession(id: string) {
  const sql = getDb();
  const rows = await sql`SELECT * FROM pe_sessions WHERE id = ${id}`;
  return rows[0] ?? null;
}

// ── Sharing ──────────────────────────────────────────────────────────────────

export async function saveReportData(id: string, reportData: unknown) {
  const sql = getDb();
  await sql`
    UPDATE pe_sessions
    SET report_data = ${JSON.stringify(reportData)}
    WHERE id = ${id}
  `;
}

export async function setSessionShare(id: string, userId: string, isPublic: boolean) {
  const sql = getDb();
  await sql`
    UPDATE pe_sessions
    SET share_token = COALESCE(share_token, gen_random_uuid()::text),
        is_public   = ${isPublic}
    WHERE id = ${id} AND user_id = ${userId}
  `;
  const rows = await sql`SELECT share_token, is_public FROM pe_sessions WHERE id = ${id}`;
  return rows[0] ?? null;
}

export async function getSessionByShareToken(token: string) {
  const sql = getDb();
  const rows = await sql`
    SELECT id, prompt_title, report, report_data, is_public, submission
    FROM pe_sessions
    WHERE share_token = ${token}
  `;
  return rows[0] ?? null;
}

export async function adminGetSessionShare(id: string) {
  const sql = getDb();
  const rows = await sql`SELECT share_token, is_public FROM pe_sessions WHERE id = ${id}`;
  return rows[0] ?? null;
}
