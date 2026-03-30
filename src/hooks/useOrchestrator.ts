/**
 * useOrchestrator — PE-specific chat orchestration.
 *
 * Handles SSE streaming to /.netlify/functions/orchestrator.
 * Manages messages via local ref for real-time streaming updates,
 * then syncs to useSessionPersistence for persistence.
 */
import { useState, useRef, useCallback } from 'react';
import { useAuth } from '@clerk/react';
import { parseSSEStream } from '@AiDigital-com/design-system';
import type { ChatMessage, PromptSubmission } from '../lib/types';
import type { UseSessionPersistenceReturn } from '@AiDigital-com/design-system';

interface OrchestratorState {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
}

export function useOrchestrator(
  onDispatch: (submission: PromptSubmission, sessionId: string, messages: ChatMessage[]) => void,
  session: UseSessionPersistenceReturn,
) {
  const { getToken } = useAuth();
  const [state, setState] = useState<OrchestratorState>({
    messages: [],
    streaming: false,
    error: null,
  });

  // Local messages ref for real-time streaming (React state batches updates
  // during async loops, so we need a ref for immediate reads + writes)
  const messagesRef = useRef<ChatMessage[]>([]);

  function addMessage(msg: ChatMessage) {
    messagesRef.current = [...messagesRef.current, msg];
    setState(s => ({ ...s, messages: messagesRef.current }));
  }

  function updateLastAssistant(text: string) {
    const msgs = messagesRef.current;
    const last = msgs[msgs.length - 1];
    if (last?.role === 'assistant') {
      const updated = [...msgs.slice(0, -1), { ...last, content: last.content + text }];
      messagesRef.current = updated;
      setState(s => ({ ...s, messages: updated }));
    } else {
      addMessage({ id: crypto.randomUUID(), role: 'assistant', content: text });
    }
  }

  /** Sync local messages to session persistence */
  function syncToSession() {
    session.setMessages(messagesRef.current);
    session.flush();
  }

  const reset = useCallback(() => {
    messagesRef.current = [];
    setState({ messages: [], streaming: false, error: null });
    session.newSession();
  }, [session]);

  /** Load messages from a restored session */
  const loadMessages = useCallback((msgs: ChatMessage[]) => {
    messagesRef.current = msgs;
    setState(s => ({ ...s, messages: msgs }));
  }, []);

  async function sendMessage(userText: string) {
    if (state.streaming) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: userText };
    addMessage(userMsg);
    setState(s => ({ ...s, streaming: true, error: null }));

    // Also add to session persistence (creates session if needed)
    session.addMessage(userMsg);

    try {
      const token = await getToken();
      const res = await fetch('/.netlify/functions/orchestrator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: messagesRef.current.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) throw new Error(`Server error: ${res.status}`);

      for await (const event of parseSSEStream(res.body)) {
        if (event.type === 'text_delta') {
          updateLastAssistant(event.text);
        } else if (event.type === 'pipeline_dispatch') {
          onDispatch(
            event.submission as unknown as PromptSubmission,
            session.sessionId!,
            messagesRef.current,
          );
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }

      // Sync final messages to persistence after streaming completes
      syncToSession();

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setState(s => ({ ...s, error: msg }));
    } finally {
      setState(s => ({ ...s, streaming: false }));
    }
  }

  return { ...state, sendMessage, reset, loadMessages, sessionId: session.sessionId };
}
