import { verifyToken, createClerkClient } from '@clerk/backend';
import { getUserStatus } from './supabase.js';
import { log } from './logger.js';

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
