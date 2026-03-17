import { useState, useEffect, useCallback } from 'react';
import { AppShell, ChatPanel, ReportViewer, DownloadBar } from '@boriskulakhmetov-aidigital/design-system';
import type { AppShellContext } from '@boriskulakhmetov-aidigital/design-system';
import { SignIn, UserButton, useAuth } from '@clerk/react';
import type { AppPhase, PromptSubmission } from './lib/types';
import { useOrchestrator } from './hooks/useOrchestrator';
import { useSessionPoller } from './hooks/useSessionPoller';
import { ProgressIndicator } from './components/ProgressIndicator';
import { RefinementInput } from './components/RefinementInput';
import { SessionSidebar } from './components/SessionSidebar';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export default function App() {
  return (
    <AppShellInner />
  );
}

/**
 * Inner component that can safely call useAuth() for the sidebar's authFetch,
 * while AppShell handles auth gating, status pages, header, trial banner, and admin.
 */
function AppShellInner() {
  const { getToken, userId } = useAuth();

  // Local authFetch for the sidebar (identical to the one AppShell provides)
  const sidebarAuthFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const token = await getToken();
    return fetch(url, {
      ...options,
      headers: { ...(options.headers ?? {}), Authorization: 'Bearer ' + token },
    });
  }, [getToken]);

  const [phase, setPhase]                 = useState<AppPhase>('chat');
  const [jobId, setJobId]                 = useState<string | null>(null);
  const [submission, setSubmission]       = useState<PromptSubmission | null>(null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [pastReport, setPastReport]       = useState<string | null>(null);
  const [pastTitle, setPastTitle]         = useState<string>('');
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [iteration, setIteration]         = useState(1);
  const [engineeredPrompt, setEngineeredPrompt] = useState<string | null>(null);
  const [isRefinement, setIsRefinement]   = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  async function handlePipelineDispatch(sub: PromptSubmission, sessionId: string, messages: ChatMessage[]) {
    setSubmission(sub);
    setJobId(sessionId);
    setPastReport(null);
    setPhase('pipeline_running');
    setIteration(1);
    setIsRefinement(false);
    setEngineeredPrompt(null);
    setSidebarRefreshKey(k => k + 1);

    await fetch('/.netlify/functions/pipeline-runner-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    await fetch('/.netlify/functions/pipeline-runner-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        submission: refinementSub,
        jobId: newJobId,
        userId: userId ?? undefined,
      }),
    });
  }

  const refreshSidebar = () => setSidebarRefreshKey(k => k + 1);

  const { messages, streaming, error: chatError, sendMessage, reset: resetOrchestrator } =
    useOrchestrator(handlePipelineDispatch, sidebarAuthFetch, refreshSidebar);

  const pollResult = useSessionPoller(phase === 'pipeline_running' ? jobId : null);

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
    setLoadingSessionId(id);
    try {
      const res = await sidebarAuthFetch('/.netlify/functions/get-session?id=' + encodeURIComponent(id));
      if (!res.ok) return;
      const data = await res.json();
      const session = data.session;
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
    sidebarAuthFetch('/.netlify/functions/save-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    }).catch(console.warn);
    if (jobId === id) handleNewSession();
    setSidebarRefreshKey(k => k + 1);
  }

  const displayReport = phase === 'report_ready'
    ? (pollResult.report ?? pastReport ?? '')
    : '';
  const displayTitle = submission?.prompt_text?.slice(0, 60) ?? submission?.prompt_idea?.slice(0, 60) ?? pastTitle ?? 'prompt';

  return (
    <AppShell
      appTitle="Prompt Engineering"
      activityLabel="Session"
      detailEndpoint="get-session"
      auth={{ SignIn, UserButton, useAuth }}
      sidebar={
        <SessionSidebar
          refreshKey={sidebarRefreshKey}
          currentJobId={jobId}
          loadingSessionId={loadingSessionId}
          onSelectSession={handleLoadSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          authFetch={sidebarAuthFetch}
        />
      }
    >
      {({ authFetch }: AppShellContext) => (
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
              partial={pollResult.partial}
              pipelineStatus={pollResult.status}
              needsDesign={submission?.needs_design}
              isRefinement={isRefinement}
              iteration={iteration}
            />
          )}
          {phase === 'report_ready' && displayReport && (
            <div className="report-page">
              <DownloadBar
                reportText={displayReport}
                title={displayTitle}
              />
              <button className="btn-primary btn-sm" onClick={handleNewSession}>
                New Analysis
              </button>
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
      )}
    </AppShell>
  );
}
