import { useState, useRef, useCallback } from 'react';
import { parseSSE } from '../lib/sseParser';
import type { ChatMessage, PromptSubmission } from '../lib/types';

type DispatchFn = (submission: PromptSubmission, sessionId: string, messages: ChatMessage[]) => void;
type AuthFetch = (url: string, options?: RequestInit) => Promise<Response>;

export function useOrchestrator(onDispatch: DispatchFn, authFetch: AuthFetch) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setStreaming(true);
    setError(null);

    // Create session on first message
    if (next.length === 1) {
      authFetch('/.netlify/functions/save-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', id: sessionIdRef.current, status: 'chatting' }),
      }).catch(console.warn);
    }

    try {
      const res = await fetch('/.netlify/functions/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) throw new Error('Orchestrator request failed');

      let assistantText = '';
      const asstId = crypto.randomUUID();

      for await (const event of parseSSE(res.body)) {
        if (event.type === 'text_delta') {
          assistantText += event.text;
          setMessages(prev => {
            const existing = prev.find(m => m.id === asstId);
            if (existing) {
              return prev.map(m => m.id === asstId ? { ...m, content: assistantText } : m);
            }
            return [...prev, { id: asstId, role: 'assistant', content: assistantText }];
          });
        } else if (event.type === 'pipeline_dispatch') {
          const submission = event.submission as unknown as PromptSubmission;
          const sid = sessionIdRef.current;
          const allMsgs = [...next];
          if (assistantText) allMsgs.push({ id: asstId, role: 'assistant', content: assistantText });

          const title = (submission.prompt_text ?? submission.prompt_idea ?? '').slice(0, 60) || 'Untitled';

          authFetch('/.netlify/functions/save-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'update_submission',
              id: sid,
              submission,
              promptTitle: title,
              messages: allMsgs.map(m => ({ role: m.role, content: m.content })),
            }),
          }).catch(console.warn);

          onDispatch(submission, sid, allMsgs);
        } else if (event.type === 'error') {
          setError(event.message);
        }
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setStreaming(false);
    }
  }, [messages, authFetch, onDispatch]);

  const reset = useCallback(() => {
    setMessages([]);
    setStreaming(false);
    setError(null);
    sessionIdRef.current = crypto.randomUUID();
  }, []);

  return { messages, streaming, error, sendMessage, reset };
}
