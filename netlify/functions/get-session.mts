import { requireAuth, isAdminUser } from './_shared/auth.js';
import { getSession, adminGetSession } from './_shared/db.js';

export default async (req: Request) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

  try {
    const { userId } = await requireAuth(req);
    const session = await isAdminUser(userId)
      ? await adminGetSession(id)
      : await getSession(id, userId);

    if (!session) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json({ session }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const status = String(err).includes('Unauthorized') ? 401 : 500;
    return Response.json({ error: String(err) }, { status });
  }
};
