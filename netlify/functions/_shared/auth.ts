import { verifyToken, createClerkClient } from '@clerk/backend';
import { createClient } from '@supabase/supabase-js';
import { getUserStatus } from './supabase.js';
import { log } from './logger.js';

const EMBED_APP_NAME = 'prompt-engineering';

/** Authenticate via Clerk JWT or embed token. */
export async function requireAuthOrEmbed(req: Request): Promise<{ userId: string; email: string | null; isEmbed?: boolean }> {
  const embedToken = req.headers.get('X-Embed-Token');
  if (embedToken) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase not configured');
    const sb = createClient(url, key);
    const { data } = await sb.rpc('validate_embed_token', {
      p_token: embedToken,
      p_app: EMBED_APP_NAME,
      p_origin: req.headers.get('Origin') || null,
    });
    if (!data?.valid) throw new Error('Invalid embed token');
    return { userId: `embed:${data.org_id || 'anonymous'}`, email: null, isEmbed: true };
  }
  return requireAuth(req);
}

export async function requireAuth(req: Request): Promise<{ userId: string; email: string | null }> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error('CLERK_SECRET_KEY not configured');

  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '').trim();
  if (!token) {
    log.warn('auth.failure', { function_name: 'auth', message: 'Unauthorized', meta: { endpoint: req.url } });
    throw new Error('Unauthorized');
  }

  const payload = await verifyToken(token, { secretKey });
  const userId = payload.sub;

  let email: string | null = null;
  try {
    const clerk = createClerkClient({ secretKey });
    const user = await clerk.users.getUser(userId);
    const primary = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId);
    email = primary?.emailAddress ?? null;
  } catch {
    // non-fatal
  }

  return { userId, email };
}

export async function isAdminUser(userId: string): Promise<boolean> {
  const row = await getUserStatus(userId);
  return row?.status === 'admin';
}
