import { useState, useEffect, useRef, useCallback } from 'react'
import {
  EmbedLayout, ChatPanel, ReportViewer, DownloadBar,
  applyTheme, resolveTheme, aiLabsTheme, useJobStatus, parseSSEStream,
} from '@boriskulakhmetov-aidigital/design-system'
import type { SupabaseClient } from '@boriskulakhmetov-aidigital/design-system'
import '@boriskulakhmetov-aidigital/design-system/style.css'
import { createClient } from '@supabase/supabase-js'
import type { PromptSubmission } from '../lib/types'
import { ProgressIndicator } from '../components/ProgressIndicator'

const APP_NAME = 'prompt-engineering'
const APP_TITLE = 'Prompt Engineering'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string }
type Phase = 'chat' | 'pipeline_running' | 'report_ready' | 'error'

interface Props { token: string; theme?: string }

export default function EmbedPage({ token, theme }: Props) {
  const [validated, setValidated] = useState<boolean | null>(null)
  const [error, setError] = useState('')

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const sessionIdRef = useRef(crypto.randomUUID())
  const messagesRef = useRef<ChatMessage[]>([])

  const [phase, setPhase] = useState<Phase>('chat')
  const [jobId, setJobId] = useState<string | null>(null)
  const [submission, setSubmission] = useState<PromptSubmission | null>(null)
  const [pastReport, setPastReport] = useState<string | null>(null)
  const [pipelineError, setPipelineError] = useState<string | null>(null)

  const supabaseRef = useRef<SupabaseClient>(createClient(SUPABASE_URL, SUPABASE_ANON_KEY) as any)

  const jobStatus = useJobStatus(supabaseRef.current, phase === 'pipeline_running' ? jobId : null)
  const meta = jobStatus?.meta as Record<string, unknown> | null

  useEffect(() => {
    if (theme) {
      const resolved = resolveTheme({ slug: theme })
      applyTheme(resolved || aiLabsTheme)
    } else {
      applyTheme(aiLabsTheme)
    }

    supabaseRef.current.rpc('validate_embed_token', {
      p_token: token,
      p_app: APP_NAME,
      p_origin: window.location.origin,
    }).then(({ data, error: err }: any) => {
      if (err || !data?.valid) {
        setError(data?.reason || err?.message || 'Invalid embed token')
        setValidated(false)
      } else {
        setValidated(true)
      }
    })
  }, [token, theme])

  const dispatchPipeline = useCallback(async (sub: PromptSubmission, sid: string, msgs: ChatMessage[]) => {
    setSubmission(sub)
    setJobId(sid)
    setPastReport(null)
    setPhase('pipeline_running')

    await fetch('/.netlify/functions/pipeline-runner-background', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Embed-Token': token,
      },
      body: JSON.stringify({
        submission: { ...sub, iteration: 1 },
        jobId: sid,
        userId: `embed:anonymous`,
        messages: msgs.map(m => ({ role: m.role, content: m.content })),
      }),
    })
  }, [token])

  const sendMessage = useCallback(async (text: string) => {
    if (streaming) return

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    messagesRef.current = [...messagesRef.current, userMsg]
    setMessages([...messagesRef.current])
    setStreaming(true)
    setChatError(null)

    try {
      const res = await fetch('/.netlify/functions/orchestrator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Embed-Token': token,
        },
        body: JSON.stringify({
          messages: messagesRef.current.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok || !res.body) throw new Error(`Server error: ${res.status}`)

      const asstId = crypto.randomUUID()
      let assistantText = ''

      for await (const event of parseSSEStream(res.body)) {
        if (event.type === 'text_delta') {
          assistantText += event.text
          setMessages(prev => {
            const existing = prev.find(m => m.id === asstId)
            if (existing) return prev.map(m => m.id === asstId ? { ...m, content: assistantText } : m)
            return [...prev, { id: asstId, role: 'assistant', content: assistantText }]
          })
          messagesRef.current = messagesRef.current.find(m => m.id === asstId)
            ? messagesRef.current.map(m => m.id === asstId ? { ...m, content: assistantText } : m)
            : [...messagesRef.current, { id: asstId, role: 'assistant', content: assistantText }]
        } else if (event.type === 'pipeline_dispatch') {
          const sub = (event as any).submission as unknown as PromptSubmission
          dispatchPipeline(sub, sessionIdRef.current, messagesRef.current)
        } else if (event.type === 'error') {
          throw new Error((event as any).message)
        }
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setStreaming(false)
    }
  }, [streaming, token, dispatchPipeline])

  // Pipeline complete -> report
  useEffect(() => {
    if (jobStatus?.status === 'complete' && phase === 'pipeline_running') {
      if (jobStatus.report) setPastReport(jobStatus.report)
      setPhase('report_ready')
    } else if (jobStatus?.status === 'error' && phase === 'pipeline_running') {
      setPipelineError(jobStatus.error ?? 'Unknown pipeline error')
      setPhase('error')
    }
  }, [jobStatus?.status, phase])

  function handleNewSession() {
    setPhase('chat')
    setJobId(null)
    setSubmission(null)
    setPastReport(null)
    setPipelineError(null)
    messagesRef.current = []
    setMessages([])
    setChatError(null)
    sessionIdRef.current = crypto.randomUUID()
  }

  if (validated === null) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
  if (!validated) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>{error}</div>

  const displayReport = phase === 'report_ready' ? (jobStatus?.report ?? pastReport ?? '') : ''
  const displayTitle = submission?.prompt_text?.slice(0, 60) ?? submission?.prompt_idea?.slice(0, 60) ?? 'prompt'

  return (
    <EmbedLayout appTitle={APP_TITLE} theme={theme}>
      {phase === 'chat' && (
        <ChatPanel
          messages={messages}
          streaming={streaming}
          error={chatError}
          onSend={sendMessage}
          welcomeTitle="Prompt Engineering Assistant"
          welcomeDescription="Paste a prompt to optimize, or describe what you need. Your prompt will be tested and re-engineered for consistency and quality."
          hints={[
            'I need a prompt that summarizes meeting notes into action items',
            'Optimize this prompt for me: You are a helpful assistant. Help me write better code.',
          ]}
          placeholder="Paste your prompt here, or describe what you need..."
        />
      )}
      {phase === 'pipeline_running' && (
        <ProgressIndicator
          promptTitle={displayTitle}
          partial={jobStatus?.partial_text ?? null}
          pipelineStatus={jobStatus?.status ?? 'idle'}
          needsDesign={submission?.needs_design}
          isRefinement={false}
          iteration={1}
        />
      )}
      {phase === 'report_ready' && displayReport && (
        <div className="report-page">
          <DownloadBar reportText={displayReport} title={displayTitle} />
          <button className="btn-primary btn-sm" onClick={handleNewSession}>New Analysis</button>
          <ReportViewer reportText={displayReport} />
        </div>
      )}
      {phase === 'error' && (
        <div className="error-page">
          <p className="error-page__msg">{pipelineError ?? 'Something went wrong with the pipeline.'}</p>
          <button className="btn-primary" onClick={handleNewSession}>Try Again</button>
        </div>
      )}
    </EmbedLayout>
  )
}
