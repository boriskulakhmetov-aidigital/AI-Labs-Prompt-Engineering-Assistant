import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../lib/types';
import { MessageBubble } from './MessageBubble';

interface ChatPanelProps {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  onSend: (text: string) => void;
}

export function ChatPanel({ messages, streaming, error, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function handleSubmit() {
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft('');
    onSend(text);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-panel__messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-panel__welcome">
            <h2>Prompt Engineering Assistant</h2>
            <p>Paste a prompt to analyze and optimize it for any LLM. I'll help you understand its strengths, identify improvements, and provide an optimized version.</p>
          </div>
        )}
        {messages.map(m => (
          <MessageBubble key={m.id} role={m.role} content={m.content} />
        ))}
        {streaming && (
          <div className="typing-indicator">
            <span /><span /><span />
          </div>
        )}
        {error && <div className="chat-error">{error}</div>}
      </div>
      <div className="chat-panel__input">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste your prompt here, or describe what you need help with..."
          rows={3}
          disabled={streaming}
        />
        <button className="btn-primary" onClick={handleSubmit} disabled={!draft.trim() || streaming}>
          Send
        </button>
      </div>
    </div>
  );
}
