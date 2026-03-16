import { requireAuth, isAdminUser } from './_shared/auth.js';
import { migrateDb } from './_shared/db.js';

export default async (req: Request) => {
  try {
    const { userId } = await requireAuth(req);
    if (!await isAdminUser(userId)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    await migrateDb();
    return Response.json({ ok: true, message: 'Migration complete' });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
};
