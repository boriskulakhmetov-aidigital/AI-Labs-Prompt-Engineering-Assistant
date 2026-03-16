import { useState, useEffect } from 'react';

interface Session {
  id: string;
  prompt_title: string | null;
  status: string;
  created_at: string;
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'complete' ? 'var(--color-green)' : status === 'error' ? '#e74c3c' : 'var(--color-text-muted)';
  return <span className="status-dot" style={{ background: color }} />;
}

function timeGroup(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  if (days < 1) return 'Today';
  if (days < 2) return 'Yesterday';
  if (days < 7) return 'Last 7 days';
  return 'Older';
}

export function SessionSidebar({ refreshKey, currentJobId, loadingSessionId, onSelectSession, onNewSession, onDeleteSession, authFetch }: {
  refreshKey: number;
  currentJobId: string | null;
  loadingSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    authFetch('/.netlify/functions/list-sessions')
      .then(r => r.json())
      .then(data => setSessions(data.sessions ?? []))
      .catch(console.warn);
  }, [refreshKey]);

  if (collapsed) {
    return (
      <div className="sidebar sidebar--collapsed">
        <button className="btn-ghost btn-sm" onClick={() => setCollapsed(false)} title="Expand">&#9776;</button>
      </div>
    );
  }

  const grouped: Record<string, Session[]> = {};
  for (const s of sessions) {
    const g = timeGroup(s.created_at);
    (grouped[g] ??= []).push(s);
  }

  return (
    <div className="sidebar">
      <div className="sidebar__header">
        <button className="btn-primary btn-sm" onClick={onNewSession}>+ New</button>
        <button className="btn-ghost btn-sm" onClick={() => setCollapsed(true)}>&#10005;</button>
      </div>
      <div className="sidebar__list">
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group}>
            <div className="sidebar__group-label">{group}</div>
            {items.map(s => (
              <div
                key={s.id}
                className={`sidebar__item${s.id === currentJobId ? ' sidebar__item--active' : ''}`}
                onClick={() => onSelectSession(s.id)}
              >
                <StatusDot status={s.status} />
                <span className="sidebar__item-title">
                  {loadingSessionId === s.id ? 'Loading...' : (s.prompt_title || 'Untitled')}
                </span>
                <button
                  className="sidebar__item-delete"
                  onClick={e => { e.stopPropagation(); onDeleteSession(s.id); }}
                  title="Delete"
                >&#10005;</button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
