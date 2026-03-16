import { getStore } from '@netlify/blobs';
import type { AnalysisJobStatus } from './_shared/types.js';

export default async (req: Request) => {
  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');

  if (!jobId) {
    return Response.json({ error: 'Missing jobId' }, { status: 400 });
  }

  try {
    const store = getStore('analysis-reports');
    const value = await store.get(jobId);

    const status: AnalysisJobStatus = value
      ? JSON.parse(value)
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
