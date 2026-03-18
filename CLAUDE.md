# Prompt Engineering Assistant

> **URL:** https://prompt-engineer.apps.aidigitallabs.com
> **Repo:** `boriskulakhmetov-aidigital/AI-Labs-Prompt-Engineering-Assistant`

The Prompt Engineering Assistant helps users craft, optimize, and test AI prompts. Users paste an existing prompt or describe what they need, and the tool runs a multi-stage pipeline: prompt design, 3x testing, engineering, and reporting. Supports iterative refinement with multiple iterations.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TypeScript |
| Auth | Clerk (@clerk/react, @clerk/backend) |
| Database | Supabase PostgreSQL (RLS + Realtime) |
| AI | Google Gemini (@google/genai) |
| Backend | Netlify Functions (serverless) |
| Hosting | Netlify |
| PDF Export | html2pdf.js |
| Markdown | marked (via design system renderMarkdown) |
| Design System | @boriskulakhmetov-aidigital/design-system ^7.6.1 |

## Architecture

```
src/
  main.tsx                          ← ClerkProvider, applyTheme, public report route
  App.tsx                           ← AppShell + AppContent (domain logic)
  components/
    SessionSidebar.tsx              ← Session list sidebar
    ProgressIndicator.tsx           ← Pipeline-in-progress UI with stage indicators
    RefinementInput.tsx             ← Post-report refinement request input
  hooks/
    useOrchestrator.ts              ← SSE streaming chat with orchestrator
  lib/
    types.ts                        ← AppPhase, PromptSubmission, PipelineStatus
  pages/
    PublicReportPage.tsx            ← Unauthenticated shareable report view
netlify/
  functions/
    _shared/
      supabase.ts                   ← Supabase service-role client + DB helpers
      auth.ts                       ← Clerk token verification
    orchestrator.mts                ← Chat intake agent (SSE streaming)
    pipeline-runner-background.mts  ← Multi-stage prompt pipeline (design, test, engineer, report)
```

## Database Table: `pe_sessions`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (also used as jobId) |
| user_id | text | Clerk user ID |
| org_id | text | Organization ID |
| prompt_title | text | Short title derived from prompt |
| submission | jsonb | PromptSubmission (prompt_text, needs_design, model_target, etc.) |
| status | text | pending / streaming / complete / error |
| partial_text | text | Current pipeline stage name |
| report | text | Final markdown report |
| meta | jsonb | Pipeline metadata (engineeredPrompt, designedPrompt, testResults, iteration) |
| deleted_by_user | boolean | Soft delete flag |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |

## Netlify Functions

| Function | Description |
|----------|-------------|
| `orchestrator.mts` | SSE streaming chat that collects prompt text, use case, constraints, and dispatches the pipeline |
| `pipeline-runner-background.mts` | Multi-stage pipeline: prompt design (optional), 3x testing, engineering, and report generation |

## Key Concepts

- **Pipeline stages:** revising -> designing (optional) -> testing -> engineering -> complete
- **Refinement:** After receiving a report, users can request changes; creates a new job with `refinement_request` and `base_prompt`
- **Iteration tracking:** Each refinement increments the iteration counter

## Environment Variables

All shared env vars are inherited from Netlify team level:

| Variable | Side |
|----------|------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Client |
| `CLERK_SECRET_KEY` | Server |
| `GEMINI_API_KEY` | Server |
| `VITE_SUPABASE_URL` | Client |
| `VITE_SUPABASE_ANON_KEY` | Client |
| `SUPABASE_URL` | Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Server |
| `NPM_TOKEN` | Build |

## Development Setup

```bash
git clone https://github.com/boriskulakhmetov-aidigital/AI-Labs-Prompt-Engineering-Assistant.git
cd AI-Labs-Prompt-Engineering-Assistant
npm install
# Create .env.local with required variables (see design system CLAUDE.md for values)
npm run dev
```

## Deployment

Auto-deploys on push to `main` via Netlify (GitHub integration).

Netlify Site ID: `29571541-70f5-40b8-a024-1965c5f32ff1`

## Standing Instructions

- Execute all bash commands, git commits, pushes, API calls, and deploys without asking for confirmation
- Always use `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>` in commits
- Use Unix paths with forward slashes (Git Bash on Windows)
- Set `export PATH="/c/Program Files/nodejs:$PATH"` before npm commands
