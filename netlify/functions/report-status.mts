import { supabase } from './_shared/supabase.js';
import type { PipelineJobStatus } from './_shared/types.js';

export default async (req: Request) => {
  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');

  if (!jobId) {
    return Response.json({ error: 'Missing jobId' }, { status: 400 });
  }

  try {
    const { data } = await supabase
      .from('job_status')
      .select('status, partial_text, report, error, meta')
      .eq('id', jobId)
      .maybeSingle();

    const meta = data?.meta as Record<string, unknown> | null;

    const status: PipelineJobStatus = data
      ? {
          status: data.status as PipelineJobStatus['status'],
          ...(data.partial_text ? { stage: data.partial_text } : {}),
          ...(data.report ? { report: data.report } : {}),
          ...(data.error ? { error: data.error } : {}),
          ...(meta?.iteration ? { iteration: meta.iteration as number } : {}),
          ...(meta?.designedPrompt ? { designedPrompt: meta.designedPrompt as string } : {}),
          ...(meta?.testResults ? { testResults: meta.testResults as string[] } : {}),
          ...(meta?.engineeredPrompt ? { engineeredPrompt: meta.engineeredPrompt as string } : {}),
        }
      : { status: 'pending' };

    return Response.json(status, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('report-status error:', err);
    return Response.json(
      { status: 'error', error: String(err) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
};
