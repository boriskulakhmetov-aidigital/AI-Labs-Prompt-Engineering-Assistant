/**
 * Server-side PDF generation via HTML2PDFAPI — Prompt Engineering
 */
import type { Context } from '@netlify/functions';

const APP = 'prompt-engineering';
const TABLE = 'pe_sessions';
const REPORT_BASE_URL = 'https://promptengineer.apps.aidigitallabs.com';

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const { requireAuth } = await import('./_shared/auth.ts');
  const { createClient } = await import('@supabase/supabase-js');

  let userId: string;
  try {
    ({ userId } = await requireAuth(req));
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sessionId } = await req.json();
  if (!sessionId) {
    return Response.json({ error: 'sessionId required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: session } = await supabase
    .from(TABLE)
    .select('pdf_url, share_token')
    .eq('id', sessionId)
    .single();

  if (session?.pdf_url) {
    return Response.json({ pdf_url: session.pdf_url, cached: true });
  }

  let token = session?.share_token;
  if (!token) {
    token = crypto.randomUUID();
    await supabase.from(TABLE).update({ share_token: token, is_public: true }).eq('id', sessionId);
  }

  const reportUrl = `${REPORT_BASE_URL}/r/${token}?theme=light&pdf-mode=1`;

  const apiKey = process.env.HTML2PDF_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'PDF service not configured' }, { status: 503 });
  }

  try {
    const pdfRes = await fetch('https://html2pdfapi.com/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        url: reportUrl,
        format: 'pdf',
        render: { fullPage: true, waitTime: 5000, waitUntil: 'networkidle0' },
        pdf: { format: 'A4', printBackground: true, margin: { top: '10mm', right: '8mm', bottom: '10mm', left: '8mm' } },
      }),
    });

    if (!pdfRes.ok) {
      const err = await pdfRes.text();
      throw new Error(`HTML2PDFAPI error: ${pdfRes.status} ${err}`);
    }

    const jobData = await pdfRes.json();
    const jobId = jobData.data?.id;
    if (!jobId) throw new Error('No job ID returned from HTML2PDFAPI');

    let pdfUrl: string | null = null;
    const start = Date.now();
    while (Date.now() - start < 60000) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(`https://html2pdfapi.com/api/render/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.data?.status === 'completed' && statusData.data?.url) { pdfUrl = statusData.data.url; break; }
        if (statusData.data?.status === 'failed') throw new Error('PDF generation failed');
      }
    }
    if (!pdfUrl) throw new Error('PDF generation timed out');

    const pdfBinary = await fetch(pdfUrl);
    const pdfBuffer = await pdfBinary.arrayBuffer();
    const storagePath = `pdfs/${APP}/${sessionId}.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from('audit-assets')
      .upload(storagePath, Buffer.from(pdfBuffer), { contentType: 'application/pdf', upsert: true });
    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/audit-assets/${storagePath}`;
    await supabase.from(TABLE).update({ pdf_url: publicUrl }).eq('id', sessionId);

    return Response.json({ pdf_url: publicUrl, cached: false });
  } catch (err: any) {
    console.error('generate-pdf error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
};
