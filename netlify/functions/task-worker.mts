/**
 * Task worker for Prompt Engineering pipeline.
 * Claims and executes tasks from pipeline_tasks table.
 * Task chain: run_pipeline → complete
 */
import { createClient } from '@supabase/supabase-js';
import { log } from './_shared/logger.js';
import { runPipeline } from './_shared/pipelineRunner.js';

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

  // PE pipeline needs streaming (Gemini Pro calls >26s)
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (msg: string) => { try { controller.enqueue(encoder.encode(`data: ${msg}\n\n`)); } catch {} };
      const heartbeat = setInterval(() => send('heartbeat'), 10_000);

      try {
        if (taskType === 'run_pipeline') {
          send('pipeline starting');
          await runPipeline(payload);
          send('pipeline complete');
        } else {
          throw new Error(`Unknown task type: ${taskType}`);
        }

        await supabase.from('pipeline_tasks').update({ status: 'complete', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', taskId);
        send('done');
      } catch (err: any) {
        send(`error: ${err.message}`);
        const willRetry = task.attempts < task.max_attempts;
        await supabase.from('pipeline_tasks').update({
          status: willRetry ? 'pending' : 'failed',
          error: err.message?.slice(0, 500),
          updated_at: new Date().toISOString(),
        }).eq('id', taskId);

        if (!willRetry) {
          await supabase.from('job_status').upsert({
            id: scanId, app: 'prompt-engineering', status: 'error',
            error: `Pipeline failed: ${err.message?.slice(0, 200)}`,
            updated_at: new Date().toISOString(),
          });
        }
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
};
