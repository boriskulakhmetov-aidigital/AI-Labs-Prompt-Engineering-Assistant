/**
 * Scheduled function: claims and executes pipeline tasks.
 *
 * Runs every minute via Netlify cron. Each invocation:
 * 1. Claims pending tasks from pipeline_tasks
 * 2. Executes them inline (no function-to-function calls)
 * 3. Loops for up to 55s to process multiple tasks
 *
 * This is the ONLY entry point for pipeline task execution.
 * No background functions, no fetch triggers.
 */
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export default async (req: Request) => {
  const siteUrl = process.env.URL || 'https://aio-optimization.apps.aidigitallabs.com';
  const supabase = getSupabase();
  let processed = 0;
  const deadline = Date.now() + 55_000;

  while (Date.now() < deadline) {
    try {
      // Call task-worker — it handles claim + execute
      const res = await fetch(`${siteUrl}/.netlify/functions/task-worker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await res.json() as Record<string, unknown>;

      if (result.status === 'idle') {
        await new Promise(r => setTimeout(r, 5000));
      } else {
        processed++;
        console.log(`[task-poller] Processed: ${result.taskType} (${result.status})`);
        // Small pause between tasks to avoid hammering
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      console.warn('[task-poller] Worker call failed:', err);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  return Response.json({ processed });
};

export const config = {
  schedule: '*/5 * * * *',
};
