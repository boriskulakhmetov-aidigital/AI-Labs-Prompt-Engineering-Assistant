import { useState, useRef, useCallback } from 'react';
import { useAuth } from '@clerk/react';
import { parseSSEStream as parseSSE } from '@boriskulakhmetov-aidigital/design-system';
import type { ChatMessage, PromptSubmission } from '../lib/types';
import type { SupabaseClient } from '@boriskulakhmetov-aidigital/design-system';

const SESSION_TABLE = 'pe_sessions';

type DispatchFn = (submission: PromptSubmission, sessionId: string, messages: ChatMessage[]) => void;

export function useOrchestrator(
  onDispatch: DispatchFn,
  supabase: SupabaseClient | null,
  onSidebarRefresh?: () => void,
) {
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const sessionCreatedRef = useRef(false);

  const getSessionId = useCallback(() => sessionIdRef.current, []);

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setStreaming(true);
    setError(null);

    // Create session on first message
    if (!sessionCreatedRef.current && supabase) {
      sessionCreatedRef.current = true;
      const title = text.slice(0, 60) || 'Untitled';
      supabase
        .from(SESSION_TABLE)
        .upsert({
          id: sessionIdRef.current,
          status: 'chatting',
          prompt_title: title,
          messages: next.map(m => ({ role: m.role, content: m.content })),
        }, { onConflict: 'id', ignoreDuplicates: true })
        .then(() => onSidebarRefresh?.())
        .catch(console.warn);
    }

    try {
      const token = await getToken();
      const res = await fetch('/.netlify/functions/orchestrator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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

          const title = (submission.prompt_text ?? submission.prompt_idea ?? text).slice(0, 60) || 'Untitled';

          if (supabase) {
            supabase
              .from(SESSION_TABLE)
              .update({
                submission,
                prompt_title: title,
                messages: allMsgs.map(m => ({ role: m.role, content: m.content })),
                status: 'pending',
              })
              .eq('id', sid)
              .then(() => {})
              .catch(console.warn);
          }

          onDispatch(submission, sid, allMsgs);
        } else if (event.type === 'error') {
          setError(event.message);
        }
      }

      // Save messages after each completed exchange
      if (assistantText && supabase) {
        const allMsgs = [...next, { id: asstId, role: 'assistant' as const, content: assistantText }];
        supabase
          .from(SESSION_TABLE)
          .update({
            messages: allMsgs.map(m => ({ role: m.role, content: m.content })),
          })
          .eq('id', sessionIdRef.current)
          .then(() => {})
          .catch(console.warn);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setStreaming(false);
    }
  }, [messages, supabase, onDispatch, onSidebarRefresh]);

  const reset = useCallback(() => {
    setMessages([]);
    setStreaming(false);
    setError(null);
    sessionIdRef.current = crypto.randomUUID();
    sessionCreatedRef.current = false;
  }, []);

  return { messages, streaming, error, sendMessage, reset, getSessionId };
}
