import { useState } from 'react';
import { downloadMarkdown, downloadPDF } from '../lib/reportDownload';

export function DownloadBar({ reportText, promptTitle, onNewSession }: {
  reportText: string;
  promptTitle: string;
  onNewSession: () => void;
}) {
  const [pdfLoading, setPdfLoading] = useState(false);

  async function handlePDF() {
    setPdfLoading(true);
    try { await downloadPDF(reportText, promptTitle); } finally { setPdfLoading(false); }
  }

  return (
    <div className="download-bar">
      <button className="btn-ghost btn-sm" onClick={() => downloadMarkdown(reportText, promptTitle)}>
        Download .md
      </button>
      <button className="btn-ghost btn-sm" onClick={handlePDF} disabled={pdfLoading}>
        {pdfLoading ? 'Generating PDF...' : 'Download PDF'}
      </button>
      <button className="btn-primary btn-sm" onClick={onNewSession}>
        New Analysis
      </button>
    </div>
  );
}
