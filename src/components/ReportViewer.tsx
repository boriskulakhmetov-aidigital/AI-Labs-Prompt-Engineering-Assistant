import { useRef, useEffect } from 'react';

export function ReportViewer({ reportText }: { reportText: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !reportText) return;
    import('marked').then(({ marked }) => {
      marked.parse(reportText).then((html: string) => {
        if (ref.current) ref.current.innerHTML = html;
      });
    });
  }, [reportText]);

  return <div className="report-viewer" ref={ref} />;
}
