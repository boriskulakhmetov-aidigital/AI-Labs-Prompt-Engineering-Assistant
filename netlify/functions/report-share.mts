import { requireAuth, isAdminUser } from './_shared/auth.js';
import { setSessionShare, adminGetSessionShare } from './_shared/supabase.js';

export default async (req: Request) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

  try {
    const { userId } = await requireAuth(req);

    if (req.method === 'GET') {
      if (!await isAdminUser(userId)) return Response.json({ error: 'Forbidden' }, { status: 403 });
      const share = await adminGetSessionShare(id);
      return Response.json(share ?? { share_token: null, is_public: false });
    }

    const body = await req.json();
    const isPublic = body.is_public === true;
    const result = await setSessionShare(id, userId, isPublic);
    return Response.json(result ?? { share_token: null, is_public: false });
  } catch (err) {
    const status = String(err).includes('Unauthorized') ? 401 : 500;
    return Response.json({ error: String(err) }, { status });
  }
};
