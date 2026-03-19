/**
 * GET /api/v1/result/:job_id
 * Get the completed prompt engineering report.
 *
 * Headers: X-API-Key: aidl_xxx
 * Query: ?format=both|markdown|visual (default: both)
 * Returns: Report data in requested format (markdown, visual/structured, or both)
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

  // Extract params
  const url = new URL(req.url);
  const jobId = url.searchParams.get('job_id');
  const format = url.searchParams.get('format') || 'both';

  if (!jobId) {
    return Response.json({ error: 'job_id is required' }, { status: 400 });
  }

  // Check job status first
  const { data: job } = await supabase
    .from('job_status')
    .select('id, status, meta')
    .eq('id', jobId)
    .eq('app', APP_NAME)
    .maybeSingle();

  if (!job) {
    return Response.json({ error: 'Job not found' }, { status: 404 });
  }

  if (job.status !== 'complete') {
    return Response.json(
      { error: 'Report not ready', status: job.status },
      { status: 202 },
    );
  }

  // Get session data via meta.session_id
  const sessionId = (job.meta as any)?.session_id;
  if (!sessionId) {
    return Response.json({ error: 'Session not found for job' }, { status: 404 });
  }

  const { data: session } = await supabase
    .from('pe_sessions')
    .select('id, prompt_title, report, report_data, submission, completed_at, share_token, is_public')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  // Auto-generate share link for API consumers
  let shareToken = session.share_token;
  if (!shareToken) {
    shareToken = crypto.randomUUID();
    await supabase.from('pe_sessions')
      .update({ share_token: shareToken, is_public: true })
      .eq('id', sessionId);
  } else if (!session.is_public) {
    await supabase.from('pe_sessions')
      .update({ is_public: true })
      .eq('id', sessionId);
  }

  // Get org theme slug for branded report URL
  let themeSlug = '';
  if (auth.orgId) {
    const { data: org } = await supabase.from('organizations')
      .select('theme_slug')
      .eq('id', auth.orgId)
      .single();
    themeSlug = org?.theme_slug || '';
  }

  const baseUrl = 'https://prompt-engineer.apps.aidigitallabs.com';
  const reportUrl = `${baseUrl}/r/${shareToken}${themeSlug ? '?theme=' + themeSlug : ''}`;

  // Log the API request
  await logApiRequest(supabase as any, {
    keyId: auth.keyId!,
    app: APP_NAME,
    endpoint: 'result',
    statusCode: 200,
    durationMs: Date.now() - start,
  });

  if (format === 'markdown') {
    return Response.json({
      job_id: jobId,
      markdown_report: session.report,
      report_url: reportUrl,
    });
  }

  if (format === 'visual') {
    return Response.json({
      job_id: jobId,
      visual_report: session.report_data,
      report_url: reportUrl,
    });
  }

  // Default: return both
  return Response.json({
    job_id: jobId,
    status: 'complete',
    prompt_title: session.prompt_title,
    submission: session.submission,
    has_visual_report: !!session.report_data,
    markdown_report: session.report,
    visual_report: session.report_data || null,
    completed_at: session.completed_at,
    report_url: reportUrl,
  });
};
