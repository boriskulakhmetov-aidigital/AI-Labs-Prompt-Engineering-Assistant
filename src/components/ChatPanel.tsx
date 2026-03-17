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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [draft]);

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
      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-welcome">
            <div className="chat-welcome__icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect x="4" y="8" width="40" height="28" rx="6" stroke="var(--accent)" strokeWidth="2" fill="var(--accent-dim)" />
                <path d="M16 20h16M16 26h10" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
                <path d="M14 36l6-4h-6z" fill="var(--accent-dim)" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="chat-welcome__title">Prompt Engineering Assistant</h2>
            <p className="chat-welcome__sub">
              Paste a prompt to optimize, or describe what you need — I'll build it from scratch.
              Your prompt will be tested 3 times and re-engineered for consistency and quality.
            </p>
            <div className="chat-welcome__hints">
              <button className="chat-hint" onClick={() => onSend('I need a prompt that summarizes meeting notes into action items')}>
                "Summarize meeting notes into action items"
              </button>
              <button className="chat-hint" onClick={() => onSend('Optimize this prompt for me: You are a helpful assistant. Help me write better code.')}>
                Optimize: "You are a helpful assistant..."
              </button>
            </div>
          </div>
        )}
        {messages.map(m => (
          <MessageBubble key={m.id} role={m.role} content={m.content} />
        ))}
        {streaming && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
          <div className="msg-assistant">
            <div className="msg-avatar">AI</div>
            <div className="msg-bubble msg-bubble--assistant msg-bubble--typing">
              <span /><span /><span />
            </div>
          </div>
        )}
        {error && <div className="chat-error">{error}</div>}
      </div>
      <div className="chat-input-area">
        <div className="chat-input-row">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Paste your prompt here, or describe what you need..."
            rows={1}
            disabled={streaming}
          />
          <button
            className="chat-send-btn"
            onClick={handleSubmit}
            disabled={!draft.trim() || streaming}
            title="Send message"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <div className="chat-input-hint">
          Press <kbd>Enter</kbd> to send, <kbd>Shift+Enter</kbd> for new line
        </div>
      </div>
    </div>
  );
}
