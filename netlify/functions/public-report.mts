import { getSessionByShareToken } from './_shared/supabase.js';

export default async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) return Response.json({ error: 'Missing token' }, { status: 400 });

  try {
    const session = await getSessionByShareToken(token);
    if (!session || !session.is_public) {
      return Response.json({ error: 'Not found or not public' }, { status: 404 });
    }

    return Response.json({
      prompt_title: session.prompt_title,
      report: session.report,
      report_data: session.report_data,
      submission: session.submission,
    }, { headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
};
