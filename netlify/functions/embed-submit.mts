/**
 * POST /.netlify/functions/embed-submit
 * Submit a new prompt engineering pipeline run via embed token.
 * Replaces direct calls to pipeline-runner-background from EmbedPage.
 *
 * Headers: X-Embed-Token: <token>
 * Body: { submission, jobId, userId, messages }
 * Returns: { job_id, status: 'pending' }
 */
import { createClient } from '@supabase/supabase-js';
import { getAppUrl } from '@boriskulakhmetov-aidigital/design-system/utils';

const APP_NAME = 'prompt-engineering';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const supabase = getSupabase();

  // Validate embed token
  const embedToken = req.headers.get('X-Embed-Token');
  if (!embedToken) {
    return Response.json({ error: 'Missing embed token' }, { status: 401 });
  }

  const { data: tokenData } = await supabase.rpc('validate_embed_token', {
    p_token: embedToken,
    p_app: APP_NAME,
    p_origin: req.headers.get('Origin') || null,
  });
  if (!tokenData?.valid) {
    return Response.json({ error: tokenData?.reason || 'Invalid embed token' }, { status: 401 });
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { submission, jobId, userId, messages } = body as {
    submission: Record<string, unknown>;
    jobId: string;
    userId: string;
    messages: Array<{ role: string; content: string }>;
  };

  if (!submission || !jobId) {
    return Response.json({ error: 'submission and jobId are required' }, { status: 400 });
  }

  const promptTitle = (submission.prompt_text as string)
    ? (submission.prompt_text as string).slice(0, 80)
    : (submission.prompt_idea as string)
      ? (submission.prompt_idea as string).slice(0, 80)
      : 'Embed Submission';

  // Create session record
  await supabase.from('pe_sessions').insert({
    id: jobId,
    user_id: userId || 'embed:anonymous',
    prompt_title: promptTitle,
    submission,
    status: 'pending',
    messages: messages || [],
  });

  // Create job_status
  await supabase.from('job_status').upsert({
    id: jobId,
    app: APP_NAME,
    status: 'pending',
    meta: { session_id: jobId, source: 'embed' },
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Write pipeline task
  const { error: taskError } = await supabase.from('pipeline_tasks').insert({
    scan_id: jobId,
    app: APP_NAME,
    task_type: 'run_pipeline',
    payload: {
      submission,
      jobId,
      userId: userId || 'embed:anonymous',
      userEmail: undefined,
      messages: messages || [],
    },
  });

  if (taskError) {
    console.error('[embed-submit] Failed to enqueue task:', taskError);
    await supabase.from('job_status').update({
      status: 'error',
      error: 'Failed to enqueue pipeline task.',
      updated_at: new Date().toISOString(),
    }).eq('id', jobId);
    return Response.json({ error: 'Failed to enqueue task' }, { status: 500 });
  }

  // Immediately notify task-worker (fire-and-forget — poller is backup)
  const siteUrl = getAppUrl('prompt-engineering', { serverUrl: process.env.URL });
  fetch(`${siteUrl}/.netlify/functions/task-worker`, { method: 'POST' }).catch(() => {});

  console.log(`[embed-submit] Task enqueued: run_pipeline for session ${jobId}`);

  return Response.json({ job_id: jobId, status: 'pending' }, { status: 202 });
};
