import { useState, useEffect } from 'react';
import { BrandMark } from './design-system/BrandMark';
import { ThemeToggle } from './design-system/ThemeToggle';
import { useTheme } from './hooks/useTheme';
import { SignIn, UserButton, useAuth, useUser } from '@clerk/react';
import type { AppPhase, PromptSubmission } from './lib/types';
import { useOrchestrator } from './hooks/useOrchestrator';
import { useSessionPoller } from './hooks/useSessionPoller';
import { ChatPanel } from './components/ChatPanel';
import { ProgressIndicator } from './components/ProgressIndicator';
import { ReportViewer } from './components/ReportViewer';
import { DownloadBar } from './components/DownloadBar';
import { RefinementInput } from './components/RefinementInput';
import { SessionSidebar } from './components/SessionSidebar';
import { AdminPanel } from './components/AdminPanel';

export default function App() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="auth-gate">
        <div className="auth-gate__brand">
          <BrandMark size={28} />
          AI Labs — Prompt Engineering Assistant
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="auth-gate">
        <div className="auth-gate__brand">
          <BrandMark size={28} />
          AI Labs — Prompt Engineering Assistant
        </div>
        <SignIn routing="hash" />
      </div>
    );
  }

  return <AuthenticatedApp />;
}

type UserStatus = 'loading' | 'active' | 'admin' | 'trial' | 'pending' | 'blocked';
type ChatMessage = { role: 'user' | 'assistant'; content: string };

function AuthenticatedApp() {
  const { getToken, userId } = useAuth();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const { theme, toggle: toggleTheme } = useTheme();

  const [userStatus, setUserStatus]       = useState<UserStatus>('loading');
  const [sessionCount, setSessionCount]   = useState(0);
  const [phase, setPhase]                 = useState<AppPhase>('chat');
  const [jobId, setJobId]                 = useState<string | null>(null);
  const [submission, setSubmission]       = useState<PromptSubmission | null>(null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [showAdmin, setShowAdmin]         = useState(false);
  const [pastReport, setPastReport]       = useState<string | null>(null);
  const [pastTitle, setPastTitle]         = useState<string>('');
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [iteration, setIteration]         = useState(1);
  const [engineeredPrompt, setEngineeredPrompt] = useState<string | null>(null);
  const [isRefinement, setIsRefinement]   = useState(false);

  async function authFetch(url: string, options: RequestInit = {}) {
    const token = await getToken();
    return fetch(url, {
      ...options,
      headers: { ...(options.headers ?? {}), Authorization: 'Bearer ' + token },
    });
  }

  useEffect(() => {
    authFetch('/.netlify/functions/init-user')
      .then(r => r.json())
      .then(data => {
        setUserStatus(data.status ?? 'active');
        setSessionCount(data.audit_count ?? 0);
      })
      .catch(() => setUserStatus('active'));
  }, []);

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

    // Use the engineered prompt from the poll result, or fallback to submission prompt
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

    setSubmission(refinementSub);
    setPastReport(null);
    setPhase('pipeline_running');
    setIteration(newIteration);
    setIsRefinement(true);
    setEngineeredPrompt(null);

    // Use the same jobId — pipeline will overwrite blob status
    await fetch('/.netlify/functions/pipeline-runner-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        submission: refinementSub,
        jobId,
        userId: userId ?? undefined,
      }),
    });
  }

  const refreshSidebar = () => setSidebarRefreshKey(k => k + 1);

  const { messages, streaming, error: chatError, sendMessage, reset: resetOrchestrator } =
    useOrchestrator(handlePipelineDispatch, authFetch, refreshSidebar);

  const pollResult = useSessionPoller(phase === 'pipeline_running' ? jobId : null);

  useEffect(() => {
    if (pollResult.status === 'complete' && phase === 'pipeline_running') {
      setPhase('report_ready');
      setSidebarRefreshKey(k => k + 1);
      if (iteration === 1) setSessionCount(c => c + 1);
      if (pollResult.engineeredPrompt) {
        setEngineeredPrompt(pollResult.engineeredPrompt);
      }
    } else if (pollResult.status === 'error' && phase === 'pipeline_running') {
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
    resetOrchestrator();
  }

  function handleSend(text: string) {
    sendMessage(text);
  }

  async function handleLoadSession(id: string) {
    setLoadingSessionId(id);
    try {
      const token = await getToken();
      const res = await fetch('/.netlify/functions/get-session?id=' + encodeURIComponent(id), {
        headers: { Authorization: 'Bearer ' + token },
      });
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
    authFetch('/.netlify/functions/save-session', {
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

  if (userStatus === 'loading') {
    return (
      <div className="auth-gate">
        <div className="auth-gate__brand">
          <BrandMark size={28} />
          AI Labs — Prompt Engineering Assistant
        </div>
      </div>
    );
  }
  if (userStatus === 'pending') {
    return (
      <div className="status-page">
        <div className="status-page__icon">&#x23F3;</div>
        <h2>Access Pending Approval</h2>
        <p>Your account is awaiting administrator approval. You'll receive access shortly.</p>
        <p className="status-page__contact">Questions? Contact <a href="mailto:support@aidigital.com">support@aidigital.com</a></p>
      </div>
    );
  }
  if (userStatus === 'blocked') {
    return (
      <div className="status-page">
        <div className="status-page__icon">&#x1F6AB;</div>
        <h2>Account Suspended</h2>
        <p>Your account partnership has been suspended.</p>
        <p className="status-page__contact">Please contact <a href="mailto:support@aidigital.com">AIDigital Customer Support</a></p>
      </div>
    );
  }

  const trialRemaining = userStatus === 'trial' ? Math.max(0, 10 - sessionCount) : null;

  return (
    <div className="app-layout">
      <SessionSidebar
        refreshKey={sidebarRefreshKey}
        currentJobId={jobId}
        loadingSessionId={loadingSessionId}
        onSelectSession={handleLoadSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        authFetch={authFetch}
      />

      <div className="app-content">
        {trialRemaining !== null && (
          <div className="trial-banner">
            Trial account — <strong>{trialRemaining}</strong> session{trialRemaining !== 1 ? 's' : ''} remaining
          </div>
        )}

        <header className="app-header">
          <div className="app-header__left">
            <div className="app-header__logo">
              <BrandMark size={20} />
              AI Labs
            </div>
            <span className="app-header__title">Prompt Engineering Assistant</span>
          </div>
          <div className="app-header__right">
            {userStatus === 'admin' && (
              <button className="btn-ghost btn-sm" onClick={() => setShowAdmin(!showAdmin)}>
                {showAdmin ? 'Close Admin' : 'Admin Console'}
              </button>
            )}
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <UserButton />
          </div>
        </header>

        <main className="app-main">
          {showAdmin ? (
            <AdminPanel authFetch={authFetch} />
          ) : (
            <>
              {phase === 'chat' && (
                <ChatPanel
                  messages={messages}
                  streaming={streaming}
                  error={chatError}
                  onSend={handleSend}
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
                    promptTitle={displayTitle}
                    onNewSession={handleNewSession}
                  />
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
                    {pollResult.error ?? 'Something went wrong with the pipeline.'}
                  </p>
                  <button className="btn-primary" onClick={handleNewSession}>Try Again</button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
