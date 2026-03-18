import { requireAuth } from './_shared/auth.js';
import { upsertUser, getUserStatus } from './_shared/supabase.js';

function orgDomainFromEmail(email: string | null): string | null {
  if (!email) return null;
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  const domain = parts[1].toLowerCase();
  const personal = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'];
  return personal.includes(domain) ? null : domain;
}

export default async (req: Request) => {
  try {
    const { userId, email } = await requireAuth(req);
    const orgDomain = orgDomainFromEmail(email);

    await upsertUser(userId, email, orgDomain);
    const userRow = await getUserStatus(userId);

    return Response.json({
      status: userRow?.status ?? 'trial',
      audit_count: userRow?.audit_count ?? 0,
      org_domain: orgDomain,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const status = String(err).includes('Unauthorized') ? 401 : 500;
    return Response.json({ error: String(err) }, { status });
  }
};
