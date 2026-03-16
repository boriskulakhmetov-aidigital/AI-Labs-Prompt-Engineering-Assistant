export function ThemeToggle({ theme, onToggle }: { theme: string; onToggle: () => void }) {
  return (
    <button className="btn-ghost btn-sm theme-toggle" onClick={onToggle} title="Toggle theme">
      {theme === 'dark' ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="8" r="3.5" />
          <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
            <line x1="8" y1="1" x2="8" y2="3" />
            <line x1="8" y1="13" x2="8" y2="15" />
            <line x1="1" y1="8" x2="3" y2="8" />
            <line x1="13" y1="8" x2="15" y2="8" />
            <line x1="3.05" y1="3.05" x2="4.46" y2="4.46" />
            <line x1="11.54" y1="11.54" x2="12.95" y2="12.95" />
            <line x1="3.05" y1="12.95" x2="4.46" y2="11.54" />
            <line x1="11.54" y1="4.46" x2="12.95" y2="3.05" />
          </g>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6 1a7 7 0 1 0 8.5 8.5A5.5 5.5 0 0 1 6 1z" />
        </svg>
      )}
    </button>
  );
}
