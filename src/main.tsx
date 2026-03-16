import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import App from './App';
import { PublicReportPage } from './pages/PublicReportPage';
import './index.css';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

const isPublicReport = window.location.pathname.startsWith('/r/');

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
