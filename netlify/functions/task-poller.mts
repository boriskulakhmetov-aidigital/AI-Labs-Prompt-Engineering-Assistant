/**
 * Scheduled function: claims and executes pipeline tasks.
 * Runs every minute, loops for 55s with 2s inter-task gaps.
 * This is the ONLY entry point for pipeline task execution.
 */

export default async (req: Request) => {
  const siteUrl = process.env.URL || 'https://prompt-engineer.apps.aidigitallabs.com';
  let processed = 0;
  const deadline = Date.now() + 55_000;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${siteUrl}/.netlify/functions/task-worker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const contentType = res.headers.get('content-type') || '';
      let result: Record<string, unknown>;

      if (contentType.includes('text/event-stream')) {
        const text = await res.text();
        const isDone = text.includes('done ');
        const isError = text.includes('error ');
        result = { status: isDone ? 'ok' : isError ? 'error' : 'streaming', taskType: 'streaming' };
      } else {
        result = await res.json() as Record<string, unknown>;
      }

      if (result.status === 'idle') {
        await new Promise(r => setTimeout(r, 5_000));
      } else {
        processed++;
        console.log(`[task-poller] Processed: ${result.taskType} (${result.status})`);
        await new Promise(r => setTimeout(r, 2_000));
      }
    } catch (err) {
      console.warn('[task-poller] Worker call failed:', err);
      await new Promise(r => setTimeout(r, 5_000));
    }
  }

  return Response.json({ processed });
};

export const config = {
  schedule: '* * * * *',
};
