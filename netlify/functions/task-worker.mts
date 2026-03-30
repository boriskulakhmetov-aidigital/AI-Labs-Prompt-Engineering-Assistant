/**
 * Task worker for Prompt Engineering pipeline.
 * Claims tasks and dispatches to background function (Pattern B).
 */
import { createClient } from '@supabase/supabase-js';
import { getAppUrl } from '@AiDigital-com/design-system/utils';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export default async (req: Request) => {
  const supabase = getSupabase();

  const { data: tasks, error } = await supabase.rpc('claim_task', { p_app: 'prompt-engineering' });
  if (error || !tasks?.length) {
    return Response.json({ status: 'idle' });
  }

  const task = tasks[0];
  const { id: taskId, scan_id: scanId, task_type: taskType, payload } = task;
  console.log(`[task-worker] Claimed ${taskType} for ${scanId}`);

  try {
    const siteUrl = getAppUrl('prompt-engineering', { serverUrl: process.env.URL });

    if (taskType === 'run_pipeline') {
      // Dispatch to background function (15-min timeout for Gemini Pro calls)
      const res = await fetch(`${siteUrl}/.netlify/functions/pipeline-runner-background`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Task-Id': taskId,
          'X-Internal-Key': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok && res.status !== 202) {
        throw new Error(`pipeline-runner-background dispatch failed: ${res.status}`);
      }
      console.log(`[task-worker] Dispatched pipeline-runner-background: ${res.status}`);
    } else {
      throw new Error(`Unknown task type: ${taskType}`);
    }

    await supabase.from('pipeline_tasks').update({
      status: 'complete', completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    return Response.json({ status: 'ok', taskType, scanId });
  } catch (err: any) {
    console.error(`[task-worker] ${taskType} failed:`, err.message);
    const willRetry = task.attempts < task.max_attempts;
    await supabase.from('pipeline_tasks').update({
      status: willRetry ? 'pending' : 'failed',
      error: err.message?.slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);
    return Response.json({ status: 'error', taskType, error: err.message });
  }
};
