import { requireAuth } from './_shared/auth.js';
import { createSession, updateSessionMessages, updateSessionSubmission, softDeleteSession } from './_shared/supabase.js';
import type { PromptSubmission } from './_shared/types.js';

export default async (req: Request) => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  try {
    const { userId, email } = await requireAuth(req);
    const body = await req.json();

    if (body.action === 'create') {
      await createSession({
        id: body.id,
        userId,
        userEmail: email,
        status: body.status ?? 'chatting',
        promptTitle: body.promptTitle ?? null,
        submission: (body.submission as PromptSubmission) ?? null,
        messages: body.messages ?? [],
      });
    } else if (body.action === 'update_submission') {
      await updateSessionSubmission(
        body.id,
        body.submission as PromptSubmission,
        body.promptTitle ?? '',
        body.messages ?? []
      );
    } else if (body.action === 'update_messages') {
      await updateSessionMessages(body.id, body.messages);
    } else if (body.action === 'delete') {
      await softDeleteSession(body.id, userId);
    } else {
      return Response.json({ error: 'Unknown action' }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    const status = String(err).includes('Unauthorized') ? 401 : 500;
    return Response.json({ error: String(err) }, { status });
  }
};
