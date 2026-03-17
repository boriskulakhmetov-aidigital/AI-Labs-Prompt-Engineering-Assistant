import { useState, useEffect } from 'react';
import { ReportViewer } from '../components/ReportViewer';
import { BrandMark } from '@boriskulakhmetov-aidigital/design-system';

export function PublicReportPage() {
  const [report, setReport] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = window.location.pathname.replace('/r/', '');
    if (!token) { setError('Invalid link'); return; }

    fetch(`/.netlify/functions/public-report?token=${encodeURIComponent(token)}`)
      .then(r => { if (!r.ok) throw new Error('Not found'); return r.json(); })
      .then(data => {
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
