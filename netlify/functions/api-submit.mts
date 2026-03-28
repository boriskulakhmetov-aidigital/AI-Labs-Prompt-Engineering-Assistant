/**
 * POST /api/v1/submit
 * Submit a new prompt engineering pipeline run via API key.
 *
 * Headers: X-API-Key: aidl_xxx
 * Body: { prompt_text?, prompt_idea?, model_target?, use_case?, desired_output?, constraints?, instructions? }
 * Returns: { job_id, status: 'pending' }
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

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const supabase = getSupabase();

  // Validate API key
  const auth = await validateApiKey(req, APP_NAME, supabase as any);
  if (!auth.valid) {
    return apiKeyErrorResponse(auth);
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { prompt_text, prompt_idea, model_target, use_case, desired_output, constraints, instructions } = body;
  if (!prompt_text && !prompt_idea) {
    return Response.json({ error: 'Either prompt_text or prompt_idea is required' }, { status: 400 });
  }

  // Use same ID for session and job — visualizer writes report_data by jobId
  const sessionId = crypto.randomUUID();
  const jobId = sessionId;

  const needsDesign = !prompt_text;
  const submission = {
    prompt_text: prompt_text || undefined,
    prompt_idea: prompt_idea || undefined,
    needs_design: needsDesign,
    ...(model_target && { model_target }),
    ...(use_case && { use_case }),
    ...(desired_output && { desired_output }),
    ...(constraints && { constraints }),
    ...(instructions && { additional_context: instructions }),
  };

  const promptTitle = prompt_text
    ? prompt_text.slice(0, 80) + (prompt_text.length > 80 ? '...' : '')
    : prompt_idea
      ? prompt_idea.slice(0, 80) + (prompt_idea.length > 80 ? '...' : '')
      : 'API Submission';

  // Create session
  await supabase.from('pe_sessions').insert({
    id: sessionId,
    user_id: (body._dispatched_by_user as string) || `api:${auth.keyId}`,
    user_email: (body._dispatched_by_email as string) || null,
    prompt_title: promptTitle,
    submission,
    status: 'pending',
    messages: [],
  });

  // Create job_status
  await supabase.from('job_status').upsert({
    id: jobId,
    app: APP_NAME,
    status: 'pending',
    meta: { session_id: sessionId, source: 'api', key_id: auth.keyId },
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Enqueue pipeline task — task-worker (cron) picks it up
  const effectiveUserId = (body._dispatched_by_user as string) || `api:${auth.keyId}`;
  const effectiveEmail = (body._dispatched_by_email as string) || undefined;

  await supabase.from('pipeline_tasks').insert({
    scan_id: jobId,
    app: 'prompt-engineering',
    task_type: 'run_pipeline',
    payload: {
      submission,
      jobId,
      userId: effectiveUserId,
      userEmail: effectiveEmail,
      messages: [],
    },
  });

  // Immediately notify task-worker (fire-and-forget — poller is backup)
  const siteUrl = process.env.URL || 'https://promptengineer.apps.aidigitallabs.com';
  fetch(`${siteUrl}/.netlify/functions/task-worker`, { method: 'POST' }).catch(() => {});

  // Log the API request
  await logApiRequest(supabase as any, {
    keyId: auth.keyId!,
    app: APP_NAME,
    endpoint: 'submit',
    statusCode: 202,
    durationMs: Date.now() - start,
  });

  return Response.json(
    { job_id: jobId, session_id: sessionId, status: 'pending' },
    { status: 202 },
  );
};
