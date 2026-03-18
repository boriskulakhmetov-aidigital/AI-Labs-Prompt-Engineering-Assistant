import { requireAuth, isAdminUser } from './_shared/auth.js';
import {
  adminListAccounts, adminListUsers, adminGetUserSessions,
  adminSetUserStatus, adminSetOrgStatus
} from './_shared/supabase.js';

export default async (req: Request) => {
  try {
    const { userId: authUserId } = await requireAuth(req);
    if (!await isAdminUser(authUserId)) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const url = new URL(req.url);
    const domain  = url.searchParams.get('domain');
    const userId  = url.searchParams.get('userId');
    const action  = url.searchParams.get('action');

    if (action === 'set_user_status' && userId) {
      const status = url.searchParams.get('status') ?? '';
      await adminSetUserStatus(userId, status);
      return Response.json({ ok: true });
    }
    if (action === 'set_org_status' && domain) {
      const status = url.searchParams.get('status') ?? '';
      await adminSetOrgStatus(domain, status);
      return Response.json({ ok: true });
    }

    if (userId) {
      const sessions = await adminGetUserSessions(userId);
      return Response.json({ sessions });
    }
    if (domain) {
      const users = await adminListUsers(domain);
      return Response.json({ users });
    }
    const accounts = await adminListAccounts();
    return Response.json({ accounts });
  } catch (err) {
    const status = String(err).includes('Unauthorized') ? 401 : String(err).includes('Forbidden') ? 403 : 500;
    return Response.json({ error: String(err) }, { status });
  }
};
