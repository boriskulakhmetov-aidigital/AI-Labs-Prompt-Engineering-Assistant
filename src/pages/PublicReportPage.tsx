import { useState, useEffect, useRef } from 'react';
import { BrandMark, ReportViewer, downloadVisualPDF } from '@boriskulakhmetov-aidigital/design-system';
import { createClient } from '@supabase/supabase-js';
import { MicroReport } from '../components/micro-report';
import type { PEReportData } from '../components/micro-report';

const SESSION_TABLE = 'pe_sessions';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export function PublicReportPage() {
  const token = window.location.pathname.replace(/^\/r\//, '').split('/')[0];
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [report, setReport] = useState<string | null>(null);
  const [reportData, setReportData] = useState<PEReportData | null>(null);
  const [title, setTitle] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState('');
  const autoPdfTriggered = useRef(false);

  useEffect(() => {
    if (!token || !supabase) { setState('error'); setErrorMsg('Invalid link'); return; }

    supabase
      .from(SESSION_TABLE)
      .select('prompt_title, report, report_data, is_public')
      .eq('share_token', token)
      .eq('is_public', true)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setErrorMsg('This report is private or no longer available.');
          setState('error');
          return;
        }
        if (!data.report && !data.report_data) {
          setErrorMsg('Report not ready yet.');
          setState('error');
          return;
        }
        // Prefer structured report_data for visual micro-report
        if (data.report_data && typeof data.report_data === 'object' && (data.report_data as PEReportData).version) {
          setReportData(data.report_data as PEReportData);
        }
        setReport(data.report || '');
        setTitle(data.prompt_title ?? 'Prompt Analysis');
        setState('ready');
      });
  }, [token]);

  // Auto PDF download when ?pdf=1 is in the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('pdf') === '1' && state === 'ready' && !autoPdfTriggered.current) {
      autoPdfTriggered.current = true;
      setTimeout(async () => {
        try {
          await downloadVisualPDF('.aidl-report-viewer', title || 'Prompt Analysis');
        } catch (e) {
          console.error('Auto PDF failed:', e);
        }
      }, 2000);
    }
  }, [state, title]);

  // postMessage listener for JobStatusWidget iframe
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'aidl-download-pdf') {
        downloadVisualPDF('.aidl-report-viewer', title || 'Prompt Analysis').catch(console.error);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [title]);

  // Report height to parent for auto-sizing iframe
  useEffect(() => {
    if (window.parent !== window) {
      const reportHeight = () => {
        window.parent.postMessage({ type: 'aidl-report-height', height: document.body.scrollHeight }, '*');
      };
      reportHeight();
      const observer = new ResizeObserver(reportHeight);
      observer.observe(document.body);
      return () => observer.disconnect();
    }
  }, []);

  if (state === 'loading') {
    return (
      <div className="auth-gate">
        <div className="auth-gate__brand">
          <span className="app-header__dot" />
          Loading Report...
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="status-page">
        <div className="status-page__icon">🔒</div>
        <h2>Report Unavailable</h2>
        <p>{errorMsg || 'This report is private or no longer available.'}</p>
      </div>
    );
  }

  if (reportData) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
        <MicroReport data={reportData} />
      </div>
    );
  }

  if (report) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
        <ReportViewer reportText={report} />
      </div>
    );
  }

  return null;
}
