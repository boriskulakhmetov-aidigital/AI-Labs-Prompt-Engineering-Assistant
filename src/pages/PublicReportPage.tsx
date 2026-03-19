import { useState, useEffect } from 'react';
import { BrandMark, ReportViewer } from '@boriskulakhmetov-aidigital/design-system';
import { createClient } from '@supabase/supabase-js';

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
  const [title, setTitle] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState('');

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
        setReport(data.report || '');
        setTitle(data.prompt_title ?? 'Prompt Analysis');
        setState('ready');
      });
  }, [token]);

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

  if (report) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
        <ReportViewer reportText={report} />
      </div>
    );
  }

  return null;
}
