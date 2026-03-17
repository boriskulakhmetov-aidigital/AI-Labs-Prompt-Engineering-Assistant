import { useRef, useEffect } from 'react';

export function MessageBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (role !== 'assistant' || !ref.current) return;
    // Lazy-load marked for assistant messages (supports full markdown)
    import('marked').then(({ marked }) => {
      marked.parse(content).then((html: string) => {
        if (ref.current) ref.current.innerHTML = html;
      });
    }).catch(() => {
      // Fallback to simple rendering
      if (ref.current) ref.current.innerHTML = simpleMarkdown(content);
    });
  }, [content, role]);

  if (role === 'user') {
    return (
      <div className="msg-user">
        <div className="msg-bubble msg-bubble--user">{content}</div>
      </div>
    );
  }

  return (
    <div className="msg-assistant">
      <div className="msg-avatar">AI</div>
      <div className="msg-bubble msg-bubble--assistant" ref={ref}>
        {simpleMarkdown(content) ? null : content}
      </div>
    </div>
  );
}

function simpleMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
}
