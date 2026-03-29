/**
 * Server-side PDF generation — Prompt Engineering
 * Primary: PDFShift (synchronous). Fallback: HTML2PDFAPI (async polling).
 */
import type { Context } from '@netlify/functions';
import { getAppUrl } from '@boriskulakhmetov-aidigital/design-system/utils';

const APP = 'prompt-engineering';
const TABLE = 'pe_sessions';
const REPORT_BASE_URL = getAppUrl('prompt-engineering', { serverUrl: process.env.URL });

async function renderWithPDFShift(url: string, apiKey: string): Promise<ArrayBuffer> {
  const res = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
    },
    body: JSON.stringify({
      source: url,
      landscape: false,
      format: 'A4',
      margin: { top: '10mm', right: '8mm', bottom: '10mm', left: '8mm' },
      delay: 6000,
      use_print: true,
      sandbox: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PDFShift error: ${res.status} ${err}`);
  }
  return res.arrayBuffer();
}

async function renderWithHTML2PDFAPI(url: string, apiKey: string): Promise<ArrayBuffer> {
  const submitRes = await fetch('https://html2pdfapi.com/api/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey, url, format: 'pdf',
      render: { fullPage: true, waitTime: 5000, waitUntil: 'networkidle0' },
      pdf: { format: 'A4', printBackground: true, margin: { top: '10mm', right: '8mm', bottom: '10mm', left: '8mm' } },
    }),
  });
  if (!submitRes.ok) throw new Error(`HTML2PDFAPI submit error: ${submitRes.status} ${await submitRes.text()}`);
  const jobId = (await submitRes.json()).data?.id;
  if (!jobId) throw new Error('No job ID returned from HTML2PDFAPI');

  let pdfUrl: string | null = null;
  const start = Date.now();
  while (Date.now() - start < 60000) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await fetch(`https://html2pdfapi.com/api/render/${jobId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    if (statusRes.ok) {
      const d = (await statusRes.json()).data;
      if (d?.status === 'completed' && d?.url) { pdfUrl = d.url; break; }
      if (d?.status === 'failed') throw new Error('HTML2PDFAPI render failed');
    }
  }
  if (!pdfUrl) throw new Error('HTML2PDFAPI timed out');
  return (await fetch(pdfUrl)).arrayBuffer();
}

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

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: session } = await supabase.from(TABLE).select('pdf_url, share_token').eq('id', sessionId).single();
  if (session?.pdf_url) return Response.json({ pdf_url: session.pdf_url, cached: true });

  let token = session?.share_token;
  if (!token) {
    token = crypto.randomUUID();
    await supabase.from(TABLE).update({ share_token: token, is_public: true }).eq('id', sessionId);
  }

  const reportUrl = `${REPORT_BASE_URL}/r/${token}?theme=light&pdf-mode=1`;
  const pdfshiftKey = process.env.PDFSHIFT_API_KEY;
  const html2pdfKey = process.env.HTML2PDF_API_KEY;

  if (!pdfshiftKey && !html2pdfKey) {
    return Response.json({ error: 'No PDF provider configured' }, { status: 503 });
  }

  try {
    let pdfBuffer: ArrayBuffer;
    let provider: string;

    if (pdfshiftKey) {
      try {
        pdfBuffer = await renderWithPDFShift(reportUrl, pdfshiftKey);
        provider = 'pdfshift';
      } catch (e: any) {
        console.warn('PDFShift failed, trying HTML2PDFAPI:', e.message);
        if (!html2pdfKey) throw e;
        pdfBuffer = await renderWithHTML2PDFAPI(reportUrl, html2pdfKey);
        provider = 'html2pdfapi';
      }
    } else {
      pdfBuffer = await renderWithHTML2PDFAPI(reportUrl, html2pdfKey!);
      provider = 'html2pdfapi';
    }

    const storagePath = `pdfs/${APP}/${sessionId}.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from('audit-assets')
      .upload(storagePath, Buffer.from(pdfBuffer), { contentType: 'application/pdf', upsert: true });
    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/audit-assets/${storagePath}`;
    await supabase.from(TABLE).update({ pdf_url: publicUrl }).eq('id', sessionId);

    return Response.json({ pdf_url: publicUrl, cached: false, provider });
  } catch (err: any) {
    console.error('generate-pdf error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
};
