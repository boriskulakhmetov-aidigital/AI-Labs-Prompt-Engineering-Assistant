import { requireAuth } from './_shared/auth.js';
import { listUserSessions } from './_shared/db.js';

export default async (req: Request) => {
  try {
    const { userId } = await requireAuth(req);
    const sessions = await listUserSessions(userId);
    return Response.json({ sessions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const status = String(err).includes('Unauthorized') ? 401 : 500;
    return Response.json({ error: String(err) }, { status });
  }
};
