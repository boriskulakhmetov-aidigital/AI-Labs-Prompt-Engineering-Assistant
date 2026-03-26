import React from 'react';
import ReactDOM from 'react-dom/client';
import '@boriskulakhmetov-aidigital/design-system/style.css';
import { applyTheme, resolveTheme } from '@boriskulakhmetov-aidigital/design-system';
import { ClerkProvider } from '@clerk/react';
import App from './App';
import { PublicReportPage } from './pages/PublicReportPage';
import './index.css';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

const isPublicReport = window.location.pathname.startsWith('/r/');
const isHelpPage = window.location.pathname === '/help';
const isEmbed = window.location.pathname === '/embed';

applyTheme(resolveTheme());

if (isEmbed) {
  const params = new URLSearchParams(window.location.search);
  const embedToken = params.get('token');
  if (embedToken) {
    import('./pages/EmbedPage').then(({ default: Embed }) => {
      ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
          <Embed token={embedToken} theme={params.get('theme') || undefined} />
        </React.StrictMode>
      );
    });
  }
} else if (isHelpPage) {
  import('./pages/HelpPage').then(({ default: Help }) => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode><Help /></React.StrictMode>
    );
  });
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      {isPublicReport ? (
        <PublicReportPage />
      ) : (
        <ClerkProvider publishableKey={publishableKey}>
          <App />
        </ClerkProvider>
      )}
    </React.StrictMode>
  );
}
// Clerk Pro dev: 1774545647
// Clerk Pro dev rebuild: 1774545625
