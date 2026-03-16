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

  async function handleAnalysisDispatch(sub: PromptSubmission, sessionId: string, messages: ChatMessage[]) {
    setSubmission(sub);
    setJobId(sessionId);
    setPastReport(null);
    setPhase('analysis_running');
    setSidebarRefreshKey(k => k + 1);

    await fetch('/.netlify/functions/analysis-agent-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        submission: sub,
        jobId: sessionId,
        userId: userId ?? undefined,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });
  }

  const { messages, streaming, error: chatError, sendMessage, reset: resetOrchestrator } =
    useOrchestrator(handleAnalysisDispatch, authFetch);

  const pollResult = useSessionPoller(phase === 'analysis_running' ? jobId : null);

  useEffect(() => {
    if (pollResult.status === 'complete' && phase === 'analysis_running') {
      setPhase('report_ready');
      setSidebarRefreshKey(k => k + 1);
      setSessionCount(c => c + 1);
    } else if (pollResult.status === 'error' && phase === 'analysis_running') {
      setPhase('error');
    }
  }, [pollResult.status, phase]);

  function handleNewSession() {
    setPhase('chat');
    setJobId(null);
    setSubmission(null);
    setPastReport(null);
    setPastTitle('');
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

      if (session.status === 'complete' && session.report) {
        setPastReport(session.report);
        setPhase('report_ready');
      } else if (session.status === 'pending' || session.status === 'streaming') {
        setPhase('analysis_running');
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
  const displayTitle = submission?.prompt_text?.slice(0, 60) ?? pastTitle ?? 'analysis';

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
            Trial account — <strong>{trialRemaining}</strong> analysis{trialRemaining !== 1 ? 'es' : ''} remaining
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
              {phase === 'analysis_running' && (
                <ProgressIndicator
                  promptTitle={displayTitle}
                  partial={pollResult.partial}
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
                </div>
              )}
              {phase === 'error' && (
                <div className="error-page">
                  <p className="error-page__msg">
                    {pollResult.error ?? 'Something went wrong with the analysis.'}
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
