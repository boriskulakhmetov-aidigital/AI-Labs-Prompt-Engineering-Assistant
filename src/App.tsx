import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { AppShell, ChatPanel, ReportViewer, DownloadBar, ConnectedShareBar, useJobStatus } from '@boriskulakhmetov-aidigital/design-system';
import type { AppShellContext, SupabaseClient } from '@boriskulakhmetov-aidigital/design-system';
import { createClient } from '@supabase/supabase-js';
import { SignIn, UserButton, useAuth } from '@clerk/react';
import type { AppPhase, PromptSubmission } from './lib/types';
import { useOrchestrator } from './hooks/useOrchestrator';
import { ProgressIndicator } from './components/ProgressIndicator';
import { RefinementInput } from './components/RefinementInput';
import { SessionSidebar } from './components/SessionSidebar';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type AuthFetch = (url: string, options?: RequestInit) => Promise<Response>;

const SESSION_TABLE = 'pe_sessions';

const supabaseConfig = import.meta.env.VITE_SUPABASE_URL ? {
  url: import.meta.env.VITE_SUPABASE_URL as string,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  createClient: createClient as any,
} : undefined;

export default function App() {
  const { userId, getToken } = useAuth();

  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);

  const handlersRef = useRef<{
    onSelectSession: (id: string) => void;
    onNewSession: () => void;
    onDeleteSession: (id: string) => void;
  }>({
    onSelectSession: () => {},
    onNewSession: () => {},
    onDeleteSession: () => {},
  });

  const [sidebarSupabase, setSidebarSupabase] = useState<SupabaseClient | null>(null);

  return (
    <AppShell
      appTitle="Prompt Engineering"
      activityLabel="Session"
      detailEndpoint="get-session"
      auth={{ SignIn, UserButton, useAuth }}
      supabaseConfig={supabaseConfig}
      helpUrl="/help"
      sidebar={
        <SessionSidebar
          refreshKey={sidebarRefreshKey}
          currentJobId={jobId}
          loadingSessionId={loadingSessionId}
          onSelectSession={(id) => handlersRef.current.onSelectSession(id)}
          onNewSession={() => handlersRef.current.onNewSession()}
          onDeleteSession={(id) => handlersRef.current.onDeleteSession(id)}
          supabase={sidebarSupabase}
        />
      }
    >
      {({ authFetch, supabase }: AppShellContext) => (
        <AppContent
          authFetch={authFetch}
          supabase={supabase}
          userId={userId}
          getToken={getToken}
          jobId={jobId}
          setJobId={setJobId}
          loadingSessionId={loadingSessionId}
          setLoadingSessionId={setLoadingSessionId}
          sidebarRefreshKey={sidebarRefreshKey}
          setSidebarRefreshKey={setSidebarRefreshKey}
          handlersRef={handlersRef}
          setSidebarSupabase={setSidebarSupabase}
        />
      )}
    </AppShell>
  );
}

/* ── Domain-specific content ────────────────────────────────────────────── */

interface AppContentProps {
  authFetch: AuthFetch;
  supabase: SupabaseClient | null;
  userId: string | null | undefined;
  getToken: () => Promise<string | null>;
  jobId: string | null;
  setJobId: (id: string | null) => void;
  loadingSessionId: string | null;
  setLoadingSessionId: (id: string | null) => void;
  sidebarRefreshKey: number;
  setSidebarRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  handlersRef: React.MutableRefObject<{
    onSelectSession: (id: string) => void;
    onNewSession: () => void;
    onDeleteSession: (id: string) => void;
  }>;
  setSidebarSupabase: Dispatch<SetStateAction<SupabaseClient | null>>;
}

function AppContent({
  authFetch, supabase, userId, getToken,
  jobId, setJobId,
  loadingSessionId, setLoadingSessionId,
  sidebarRefreshKey, setSidebarRefreshKey,
  handlersRef, setSidebarSupabase,
}: AppContentProps) {
  const [phase, setPhase]                 = useState<AppPhase>('chat');
  const [submission, setSubmission]       = useState<PromptSubmission | null>(null);
  const [pastReport, setPastReport]       = useState<string | null>(null);
  const [pastTitle, setPastTitle]         = useState<string>('');
  const [iteration, setIteration]         = useState(1);
  const [engineeredPrompt, setEngineeredPrompt] = useState<string | null>(null);
  const [isRefinement, setIsRefinement]   = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  // Expose supabase to sidebar via state bridge (triggers re-render)
  useEffect(() => { setSidebarSupabase(supabase); }, [supabase, setSidebarSupabase]);

  async function handlePipelineDispatch(sub: PromptSubmission, sessionId: string, messages: ChatMessage[]) {
    setSubmission(sub);
    setJobId(sessionId);
    setPastReport(null);
    setPhase('pipeline_running');
    setIteration(1);
    setIsRefinement(false);
    setEngineeredPrompt(null);
    setSidebarRefreshKey(k => k + 1);

    const token = await getToken();
    await fetch('/.netlify/functions/pipeline-runner-background', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        submission: { ...sub, iteration: 1 },
        jobId: sessionId,
        userId: userId ?? undefined,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });
  }

  async function handleRefinement(refinementRequest: string) {
    if (!submission || !jobId) return;

    const basePrompt = engineeredPrompt
      || submission.prompt_text
      || submission.prompt_idea
      || '';

    const newIteration = iteration + 1;
    const refinementSub: PromptSubmission = {
      ...submission,
      needs_design: false,
      refinement_request: refinementRequest,
      base_prompt: basePrompt,
      iteration: newIteration,
    };

    const newJobId = crypto.randomUUID();

    setSubmission(refinementSub);
    setJobId(newJobId);
    setPastReport(null);
    setPhase('pipeline_running');
    setIteration(newIteration);
    setIsRefinement(true);
    setEngineeredPrompt(null);

    const token = await getToken();
    await fetch('/.netlify/functions/pipeline-runner-background', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        submission: refinementSub,
        jobId: newJobId,
        userId: userId ?? undefined,
      }),
    });
  }

  const refreshSidebar = () => setSidebarRefreshKey(k => k + 1);

  const { messages, streaming, error: chatError, sendMessage, reset: resetOrchestrator } =
    useOrchestrator(handlePipelineDispatch, supabase, refreshSidebar);

  // Realtime job status via Supabase (replaces polling)
  const jobStatus = useJobStatus(supabase, phase === 'pipeline_running' ? jobId : null);
  const meta = jobStatus?.meta as Record<string, unknown> | null;
  const pollResult = {
    status: jobStatus?.status ?? 'idle',
    stage: jobStatus?.partial_text ?? null,
    report: jobStatus?.report ?? null,
    error: jobStatus?.error ?? null,
    engineeredPrompt: (meta?.engineeredPrompt as string) ?? null,
    designedPrompt: (meta?.designedPrompt as string) ?? null,
    testResults: (meta?.testResults as string[]) ?? null,
    iteration: (meta?.iteration as number) ?? null,
  };

  useEffect(() => {
    if (pollResult.status === 'complete' && phase === 'pipeline_running') {
      if (pollResult.report) setPastReport(pollResult.report);
      if (pollResult.engineeredPrompt) setEngineeredPrompt(pollResult.engineeredPrompt);
      setPhase('report_ready');
      setSidebarRefreshKey(k => k + 1);
    } else if (pollResult.status === 'error' && phase === 'pipeline_running') {
      setPipelineError(pollResult.error ?? 'Unknown pipeline error');
      setPhase('error');
    }
  }, [pollResult.status, phase]);

  function handleNewSession() {
    setPhase('chat');
    setJobId(null);
    setSubmission(null);
    setPastReport(null);
    setPastTitle('');
    setIteration(1);
    setIsRefinement(false);
    setEngineeredPrompt(null);
    setPipelineError(null);
    resetOrchestrator();
  }

  function handleSend(text: string, _asset: unknown) {
    sendMessage(text);
  }

  async function handleLoadSession(id: string) {
    if (!supabase) return;
    setLoadingSessionId(id);
    try {
      const { data: session } = await supabase
        .from(SESSION_TABLE)
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!session) return;

      setJobId(session.id);
      setSubmission(session.submission ?? null);
      setPastTitle(session.prompt_title ?? '');
      setIteration(session.submission?.iteration ?? 1);
      setIsRefinement(false);
      setEngineeredPrompt(null);

      if (session.status === 'complete' && session.report) {
        setPastReport(session.report);
        setPhase('report_ready');
      } else if (session.status === 'pending' || session.status === 'streaming') {
        setPhase('pipeline_running');
      } else {
        setPhase('chat');
      }
    } catch (err) {
      console.warn('Load session failed:', err);
    } finally {
      setLoadingSessionId(null);
    }
  }

  async function handleDeleteSession(id: string) {
    if (supabase) {
      supabase
        .from(SESSION_TABLE)
        .update({ deleted_by_user: true })
        .eq('id', id)
        .then(() => {})
        .catch(console.warn);
    }
    if (jobId === id) handleNewSession();
    setSidebarRefreshKey(k => k + 1);
  }

  // Expose handlers to sidebar via ref bridge
  handlersRef.current = { onSelectSession: handleLoadSession, onNewSession: handleNewSession, onDeleteSession: handleDeleteSession };

  const displayReport = phase === 'report_ready'
    ? (pollResult.report ?? pastReport ?? '')
    : '';
  const displayTitle = submission?.prompt_text?.slice(0, 60) ?? submission?.prompt_idea?.slice(0, 60) ?? pastTitle ?? 'prompt';

  return (
    <>
      {phase === 'chat' && (
        <ChatPanel
          messages={messages}
          streaming={streaming}
          error={chatError}
          onSend={handleSend}
          welcomeTitle="Prompt Engineering Assistant"
          welcomeDescription="Paste a prompt to optimize, or describe what you need — I'll build it from scratch. Your prompt will be tested 3 times and re-engineered for consistency and quality."
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
          partial={pollResult.stage}
          pipelineStatus={pollResult.status}
          needsDesign={submission?.needs_design}
          isRefinement={isRefinement}
          iteration={iteration}
        />
      )}
      {phase === 'report_ready' && displayReport && (
        <div className="report-page">
          <div className="report-bar">
            <DownloadBar
              reportText={displayReport}
              title={displayTitle}
            />
            {supabase && jobId && (
              <ConnectedShareBar
                jobId={jobId}
                supabase={supabase}
                tableName="pe_sessions"
              />
            )}
            <button className="btn-primary btn-sm" onClick={handleNewSession}>
              New Analysis
            </button>
          </div>
          <ReportViewer reportText={displayReport} />
          <RefinementInput
            onSubmit={handleRefinement}
            iteration={iteration}
          />
        </div>
      )}
      {phase === 'error' && (
        <div className="error-page">
          <p className="error-page__msg">
            {pipelineError ?? 'Something went wrong with the pipeline.'}
          </p>
          <button className="btn-primary" onClick={handleNewSession}>Try Again</button>
        </div>
      )}
    </>
  );
}
