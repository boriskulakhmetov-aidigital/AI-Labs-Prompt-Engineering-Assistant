import { useRef, useEffect } from 'react';

export function ReportViewer({ reportText }: { reportText: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !reportText) return;
    import('marked').then(({ marked }) => {
      const result = marked.parse(reportText);
      // marked.parse can return string or Promise<string> depending on config
      if (typeof result === 'string') {
        if (ref.current) ref.current.innerHTML = result;
      } else if (result && typeof result.then === 'function') {
        result.then((html: string) => {
          if (ref.current) ref.current.innerHTML = html;
        });
      }
    }).catch(() => {
      // Fallback: render as pre-formatted text
      if (ref.current) {
        ref.current.innerText = reportText;
      }
    });
  }, [reportText]);

  return <div className="report-viewer" ref={ref} />;
}
