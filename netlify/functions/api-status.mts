/**
 * GET /api/v1/status/:job_id
 * Check the status of a prompt engineering pipeline job.
 *
 * Headers: X-API-Key: aidl_xxx
 * Returns: { job_id, status, started_at?, updated_at? }
 */
import { createClient } from '@supabase/supabase-js';
import { validateApiKey, logApiRequest, apiKeyErrorResponse } from '@boriskulakhmetov-aidigital/design-system/server';

const APP_NAME = 'prompt-engineering';

function getSupabase() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

export default async (req: Request) => {
  const start = Date.now();

  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const supabase = getSupabase();

  // Validate API key
  const auth = await validateApiKey(req, APP_NAME, supabase as any);
  if (!auth.valid) {
    return apiKeyErrorResponse(auth);
  }

  // Extract job_id from query params
  const url = new URL(req.url);
  const jobId = url.searchParams.get('job_id');
  if (!jobId) {
    return Response.json({ error: 'job_id is required' }, { status: 400 });
  }

  // Fetch job status
  const { data: job, error } = await supabase
    .from('job_status')
    .select('id, app, status, error, meta, started_at, updated_at')
    .eq('id', jobId)
    .eq('app', APP_NAME)
    .maybeSingle();

  if (error || !job) {
    return Response.json({ error: 'Job not found' }, { status: 404 });
  }

  // Log the API request
  await logApiRequest(supabase as any, {
    keyId: auth.keyId!,
    app: APP_NAME,
    endpoint: 'status',
    statusCode: 200,
    durationMs: Date.now() - start,
  });

  return Response.json({
    job_id: job.id,
    status: job.status,
    error: job.error ?? undefined,
    started_at: job.started_at,
    updated_at: job.updated_at,
  });
};
