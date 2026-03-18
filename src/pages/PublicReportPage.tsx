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
  const [report, setReport] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = window.location.pathname.replace('/r/', '');
    if (!token || !supabase) { setError('Invalid link'); return; }

    supabase
      .from(SESSION_TABLE)
      .select('prompt_title, report, report_data, is_public, submission')
      .eq('share_token', token)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data || !data.is_public) {
          setError('Report not found or not public');
          return;
        }
        setReport(data.report ?? '');
        setTitle(data.prompt_title ?? 'Prompt Analysis');
      })
      .catch(() => setError('Report not found or not public'));
  }, []);

  if (error) {
    return (
      <div className="public-report-page">
        <div className="public-report-page__header">
          <BrandMark size={24} />
          <span>AI Labs — Prompt Engineering Assistant</span>
        </div>
        <div className="public-report-page__error">{error}</div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="public-report-page">
        <div className="public-report-page__header">
          <BrandMark size={24} />
          <span>AI Labs — Prompt Engineering Assistant</span>
        </div>
        <div className="public-report-page__loading">Loading report...</div>
      </div>
    );
  }

  return (
    <div className="public-report-page">
      <div className="public-report-page__header">
        <BrandMark size={24} />
        <span>AI Labs — Prompt Engineering Assistant</span>
        <span className="public-report-page__title">{title}</span>
      </div>
      <ReportViewer reportText={report} />
    </div>
  );
}
