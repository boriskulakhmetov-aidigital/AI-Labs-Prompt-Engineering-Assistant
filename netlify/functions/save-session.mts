/**
 * Session merge endpoint — atomic read-merge-write.
 * Uses DS mergeSession utility with service role (survives JWT expiry).
 */
import type { Context } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { mergeSession } from '@boriskulakhmetov-aidigital/design-system/server';

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  // Light auth — any bearer token (service role handles actual DB access)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sessionId, patch, mergeConfig } = await req.json();
  if (!sessionId) {
    return Response.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let result = await mergeSession(supabase, {
    table: 'pe_sessions',
    sessionId,
    patch,
    mergeConfig: mergeConfig || { objectFields: ['submission'] },
  });

  // If session doesn't exist yet (race with createSession), create it
  if (!result.ok && (result.error?.includes('not found') || result.error?.includes('Cannot coerce') || result.error?.includes('0 rows'))) {
    const { error: insertError } = await supabase
      .from('pe_sessions')
      .insert({ id: sessionId, ...patch })
      .select('id')
      .single();
    if (insertError) {
      // Another process may have created it — retry merge
      result = await mergeSession(supabase, {
        table: 'pe_sessions',
        sessionId,
        patch,
        mergeConfig: mergeConfig || { objectFields: ['submission'] },
      });
    } else {
      result = { ok: true };
    }
  }

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  return Response.json(result);
};
