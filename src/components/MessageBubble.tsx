function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
}

export function MessageBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  if (role === 'user') {
    return <div className="msg msg--user"><div className="msg__body">{content}</div></div>;
  }
  return (
    <div className="msg msg--assistant">
      <div className="msg__body" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
    </div>
  );
}
