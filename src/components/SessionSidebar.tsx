import { useState, useEffect } from 'react';
import type { SupabaseClient } from '@boriskulakhmetov-aidigital/design-system';

const SESSION_TABLE = 'pe_sessions';

interface Session {
  id: string;
  prompt_title: string | null;
  status: string;
  created_at: string;
}

function StatusDot({ status }: { status: string }) {
  const cls =
    status === 'complete' ? 'status-dot--done' :
    status === 'error' ? 'status-dot--error' :
    status === 'chatting' ? 'status-dot--chatting' :
    'status-dot--spinning';
  return <span className={`status-dot ${cls}`} />;
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

export function SessionSidebar({ refreshKey, currentJobId, loadingSessionId, onSelectSession, onNewSession, onDeleteSession, supabase }: {
  refreshKey: number;
  currentJobId: string | null;
  loadingSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  supabase: SupabaseClient | null;
}) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.from(SESSION_TABLE)
      .select('id, prompt_title, status, created_at, completed_at')
      .or('deleted_by_user.is.null,deleted_by_user.eq.false')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setSessions((data as Session[]) ?? []))
      .catch(console.warn);
  }, [refreshKey, supabase]);

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
            {items.map(s => {
              const isActive = s.id === currentJobId;
              return (
                <div key={s.id} className={`sidebar__item-wrap${isActive ? ' sidebar__item-wrap--active' : ''}`}>
                  <button
                    className="sidebar__item"
                    onClick={() => onSelectSession(s.id)}
                  >
                    <div className="sidebar__item-left">
                      <StatusDot status={s.status} />
                      <span className="sidebar__item-brand">
                        {loadingSessionId === s.id ? 'Loading...' : (s.prompt_title || 'Untitled')}
                      </span>
                    </div>
                  </button>
                  <button
                    className="sidebar__delete"
                    onClick={e => { e.stopPropagation(); onDeleteSession(s.id); }}
                    title="Delete"
                  >&#10005;</button>
                </div>
              );
            })}
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="sidebar__empty">No sessions yet</div>
        )}
      </div>
    </div>
  );
}
