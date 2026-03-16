import { useState, useEffect } from 'react';

type AuthFetch = (url: string, options?: RequestInit) => Promise<Response>;

export function AdminPanel({ authFetch }: { authFetch: AuthFetch }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    authFetch('/.netlify/functions/admin-accounts')
      .then(r => r.json())
      .then(d => setAccounts(d.accounts ?? []))
      .catch(console.warn);
  }, []);

  function loadUsers(domain: string) {
    setSelectedDomain(domain);
    setSelectedUserId(null);
    setSessions([]);
    authFetch(`/.netlify/functions/admin-accounts?domain=${encodeURIComponent(domain)}`)
      .then(r => r.json())
      .then(d => setUsers(d.users ?? []))
      .catch(console.warn);
  }

  function loadSessions(userId: string) {
    setSelectedUserId(userId);
    authFetch(`/.netlify/functions/admin-accounts?userId=${encodeURIComponent(userId)}`)
      .then(r => r.json())
      .then(d => setSessions(d.sessions ?? []))
      .catch(console.warn);
  }

  async function setUserStatus(userId: string, status: string) {
    await authFetch(`/.netlify/functions/admin-accounts?action=set_user_status&userId=${encodeURIComponent(userId)}&status=${status}`);
    if (selectedDomain) loadUsers(selectedDomain);
  }

  async function runMigration() {
    const res = await authFetch('/.netlify/functions/db-migrate');
    const data = await res.json();
    alert(data.message || data.error || 'Done');
  }

  return (
    <div className="admin-panel">
      <div className="admin-panel__header">
        <h2>Admin Console</h2>
        <button className="btn-ghost btn-sm" onClick={runMigration}>Run Migration</button>
      </div>
      <div className="admin-panel__columns">
        <div className="admin-col">
          <h3>Accounts</h3>
          {accounts.map(a => (
            <div key={a.domain} className={`admin-row${a.domain === selectedDomain ? ' admin-row--active' : ''}`} onClick={() => loadUsers(a.domain)}>
              <strong>{a.domain}</strong>
              <span>{a.user_count} users, {a.session_count} sessions</span>
            </div>
          ))}
        </div>
        <div className="admin-col">
          <h3>Users {selectedDomain && `— ${selectedDomain}`}</h3>
          {users.map(u => (
            <div key={u.user_id} className={`admin-row${u.user_id === selectedUserId ? ' admin-row--active' : ''}`} onClick={() => loadSessions(u.user_id)}>
              <span>{u.user_email ?? u.user_id}</span>
              <select value={u.status} onChange={e => setUserStatus(u.user_id, e.target.value)} onClick={e => e.stopPropagation()}>
                <option value="trial">Trial</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="blocked">Blocked</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          ))}
        </div>
        <div className="admin-col">
          <h3>Sessions {selectedUserId && `— ${selectedUserId.slice(0, 12)}...`}</h3>
          {sessions.map(s => (
            <div key={s.id} className="admin-row">
              <span>{s.prompt_title || 'Untitled'}</span>
              <span className={`status-badge status-badge--${s.status}`}>{s.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
