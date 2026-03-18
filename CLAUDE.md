# AIDigital Labs — Prompt Engineering Assistant

> Auto-loaded by Claude Code. Provides full context for this app.

## What This App Does

AI-powered prompt engineering tool that takes a raw prompt (or idea), tests it 3 times for consistency, re-engineers it for quality, and delivers a detailed analysis report. Supports iterative refinement — users can request changes and the pipeline re-runs with the improved prompt.

## URLs

- **Live:** https://prompt-engineer.apps.aidigitallabs.com
- **Netlify site ID:** `29571541-70f5-40b8-a024-1965c5f32ff1`
- **GitHub:** `boriskulakhmetov-aidigital/AI-Labs-Prompt-Engineering-Assistant`
- **Deploy:** `npx netlify-cli deploy --prod --dir=dist --site=29571541-70f5-40b8-a024-1965c5f32ff1`

## Tech Stack

- React 19 + Vite 6 + TypeScript
- `@boriskulakhmetov-aidigital/design-system` (shared components + theme)
- Clerk authentication (`@clerk/react`)
- Google Gemini AI (`@google/genai`) — `gemini-2.0-flash` for orchestrator and prompt agent
- Neon serverless PostgreSQL (`@neondatabase/serverless`)
- Netlify Blobs for async job storage
- Netlify Functions (serverless backend, `.mts` ESM with esbuild)
- `marked` for Markdown rendering, `html2pdf.js` for PDF export

## Key Patterns

- Background function config: `export const config: Config = { background: true }`
- Prompts are TypeScript string constants (not file reads) for reliable esbuild bundling
- Frontend polls `report-status` every 3s using `useSessionPoller`
- Same Clerk auth + Neon DB user base as other audit apps
- DB tables are prefixed with `pe_` to avoid collision

## Design System Integration

```typescript
// main.tsx
import { applyTheme, aiLabsTheme } from '@boriskulakhmetov-aidigital/design-system'
import '@boriskulakhmetov-aidigital/design-system/style.css'
applyTheme(aiLabsTheme)
```

Components used from design system: `AppShell`, `ChatPanel`, `ReportViewer`, `DownloadBar`

AppShell props: `activityLabel="Session"`, `detailEndpoint="get-session"`

## Project Structure

```
src/
  main.tsx              — Entry point, Clerk auth provider, theme setup, public report route
  App.tsx               — AppShell + phase-based UI (chat → pipeline_running → report_ready)
  index.css             — CSS variable definitions
  lib/
    types.ts            — AppPhase, ChatMessage, PromptSubmission, PipelineStatus
    sseParser.ts        — SSE stream parser utility
    reportDownload.ts   — PDF/report download helpers
  hooks/
    useOrchestrator.ts  — Chat intake flow, dispatches pipeline when ready
    useSessionPoller.ts — Polls pipeline job status
  components/
    SessionSidebar.tsx  — Past sessions list with load/delete
    ProgressIndicator.tsx — Pipeline-in-progress animation with stage display
    RefinementInput.tsx — Post-report refinement request input
  pages/
    PublicReportPage.tsx — Public shareable report at /r/:id (no auth)
netlify/functions/
  _shared/              — Shared utilities (DB client, auth helpers)
  orchestrator.mts      — Chat intake SSE endpoint (streaming)
  pipeline-runner-background.mts — Background function: runs prompt analysis pipeline
  get-session.mts       — Fetch single session by ID
  list-sessions.mts     — List user's past sessions
  save-session.mts      — Create/update/delete sessions
  report-status.mts     — Poll pipeline job status
  report-share.mts      — Generate/manage public share links
  public-report.mts     — Fetch public report data (no auth)
  init-user.mts         — Initialize user record on first login
  admin-accounts.mts    — Admin account management
  db-migrate.mts        — Database migration utility
```

## Data Model

```typescript
type AppPhase = 'chat' | 'pipeline_running' | 'report_ready' | 'error';

interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; }

interface PromptSubmission {
  prompt_text?: string; prompt_idea?: string; needs_design: boolean;
  model_target?: string; use_case?: string; desired_output?: string;
  constraints?: string; additional_context?: string;
  refinement_request?: string; base_prompt?: string; iteration?: number;
}

interface PipelineStatus {
  status: 'pending' | 'revising' | 'designing' | 'testing' | 'engineering' | 'complete' | 'error';
  stage?: string; designedPrompt?: string; testResults?: string[];
  report?: string; engineeredPrompt?: string; partial?: string; error?: string;
}
```

## API Endpoints (Netlify Functions)

| Endpoint | Method | Description |
|---|---|---|
| `orchestrator` | POST (SSE) | Chat intake — streams assistant messages, dispatches pipeline |
| `pipeline-runner-background` | POST | Background: runs prompt analysis, testing, and re-engineering |
| `get-session` | GET | Fetch single session by `?id=` |
| `list-sessions` | GET | List all sessions for authenticated user |
| `save-session` | POST | Create, update, or delete sessions |
| `report-status` | GET | Poll pipeline job completion status |
| `report-share` | POST | Generate or manage public share link |
| `public-report` | GET | Fetch public report (no auth required) |
| `init-user` | POST | Initialize user record on first sign-in |
| `admin-accounts` | GET/POST | Admin-only account management |
| `db-migrate` | POST | Run database migrations |

## CSS Notes

- `index.css` defines theme variables consistent with other AIDigital Labs apps
- Theme is applied via `applyTheme(aiLabsTheme)` from design system

## NPM Authentication

`.npmrc` at repo root:
```
@boriskulakhmetov-aidigital:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

For local dev: set `NPM_TOKEN` env var to the GitHub PAT (see design system CLAUDE.md for the token).

## Architecture Reference

This app is part of the AIDigital Labs portfolio. For the full architecture (all apps, design system, theme system, conventions), see `CLAUDE.md` in the design system repo: `AIDigital-Labs-Design-System`.
