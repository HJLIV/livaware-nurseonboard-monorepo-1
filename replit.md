# Livaware NurseOnboard Platform (Consolidated Monorepo)

## Project Overview

A full-stack TypeScript monorepo combining three private applications — **Clinical-Skills-Arcade**, **Nurse-Preboard**, and **Nurse-Onboard** — into a single Express + React/Vite platform. Uses PostgreSQL with Drizzle ORM. Deployed on Replit with autoscale.

## Architecture

- **Frontend**: React 18 + Vite, Tailwind CSS + Radix UI components, `client/`
- **Backend**: Express 5 (Node.js), `server/`
- **Shared schema**: Drizzle ORM + unified types, `shared/schema.ts` (uses `nurseId` throughout; `candidates`/`magicLinks` are aliases for `nurses`/`portalLinks`)
- **Naming convention**: Schema uses `nurseId` for FK columns. Storage/route code uses `nurseId` consistently. Legacy `candidateId` naming was fully migrated.
- **Stage terminology**: DB enum values are unchanged (`preboard`, `onboard`, `skills_arcade`, `completed`), but the UI uses display names: **Applicant** (preboard), **Candidate** (onboard), **Skills Arcade**, **Nurse** (completed). Mapping is defined in `shared/schema.ts` via `STAGE_DISPLAY_NAMES` and `getStageDisplayName()`.
- **Build System**: `npm` with `tsx` (dev) and `esbuild` (production)

## Key Technologies

- TypeScript (strict monorepo)
- Express 5 + express-session (session-based auth, admin/team roles)
- Drizzle ORM + PostgreSQL (`pg` driver)
- React + Vite (HMR in dev, served through Express)
- Tailwind CSS + Radix UI + shadcn-style components
- Framer Motion, Recharts, React Hook Form, Zod
- OpenAI / Anthropic AI services (compliance, NMC, DBS, references, certificates)
- Microsoft Graph / Outlook API integration (emails, SharePoint)

## Running the Project

- **Development**: `npm run dev` — starts Express on port 5000, serves Vite frontend
- **Production build**: `npm run build`
- **Production start**: `npm start`
- **DB schema push**: `npm run db:push`
- **Tests**: `npm test` — runs 100 Vitest API tests across all modules

## Modules

### Nurse-Onboard (AI-powered compliance & onboarding)
- Full NMC PIN verification (`server/nmc-service.ts`) — step-by-step walkthrough with external link
- DBS certificate checking (`server/dbs-service.ts`) — step-by-step walkthrough with external links to gov.uk
- Editable Identity tab with edit-mode toggle, PATCH save to `/api/nurses/:id` with automatic audit trail logging
- AI compliance checks (`server/compliance-check-ai.ts`, `server/audit-summary-ai.ts`)
- Document AI analysis (`server/document-ai.ts`, `server/certificate-ai.ts`)
- Reference AI (`server/reference-ai.ts`)
- Health triage (`server/health-triage-ai.ts`)
- Passport parsing (`server/passport-parser.ts`)
- PDF generation (`server/pdf-generator.ts`)
- SharePoint integration (`server/sharepoint.ts`, `server/sharepoint-helper.ts`)
- Outlook email integration (`server/outlook.ts`)
- Magic link portal for nurses (`server/routes/portal.ts`)
- Referee form handling (`server/routes/referee.ts`)
- Full admin candidate management (`server/routes/onboard.ts`)

### Clinical-Skills-Arcade (Gamified competency assessments)
- 40 pre-seeded clinical scenario modules (`server/arcade-seed.ts`, `server/arcade-seed-modules.ts`)
- Scenario player with scoring (`server/arcade-scoring.ts`)
- Nurse, trainer, and admin roles with separate views
- Trainer remediation queue
- Admin: module management, user management, CSV reports
- Routes: `server/routes/skills-arcade.ts`
- Auth: Platform admins (`isAuthenticated + role=admin`) are bridged into arcade admin endpoints via `isPlatformAdmin()` in skills-arcade.ts

### Nurse-Preboard (Pre-onboarding assessment)
- AI-powered timed assessment with domain scoring
- PDF report generation and email delivery
- Routes: `server/routes/preboard.ts`

## Frontend Pages

### Core
- `/` — Dashboard with stats, pipeline funnel, recent activity, inline nurse registration
- `/candidates` — Candidate list (Nurse-Onboard)
- `/candidates/:id` — Full candidate detail with AI tools
- `/pipeline` — Kanban pipeline view (uses `/api/candidates`, `status` field for stage columns)
- `/nurses` — Nurse registry with Register & Invite dialog (auto-generates preboard portal link)
- `/nurses/:id` — Nurse detail with overview, preboard, onboard, arcade, and audit tabs

### Portal (public)
- `/portal/:token` — Portal hub (token-gated)
- `/portal/page/:token` — Full nurse-facing onboarding portal
- `/referee/:token` — Referee form

### Preboard
- `/preboard` — Admin preboard overview
- `/preboard/assessment` — Nurse self-assessment form

### Skills Arcade
- `/arcade` — Nurse dashboard (module assignments)
- `/arcade/scenario/:id` — Scenario player
- `/arcade/walkthrough/:id` — Module walkthrough
- `/arcade/trainer` — Trainer remediation queue
- `/arcade/admin/modules` — Module management
- `/arcade/admin/reports` — Reports + CSV export
- `/arcade/admin/users` — User management

### System
- `/audit` — Audit trail (admin only)
- `/guide` — Admin Guide with walkthroughs & SOPs (step-by-step procedures for all platform features)

## Server Routes

- `server/routes/admin.ts` — Nurse CRUD with preboard invite generation, advance-stage, detail sub-routes (preboard/onboard/arcade/audit-log)
- `server/routes/onboard.ts` — Full Nurse-Onboard admin (786 lines, all AI integrations)
- `server/routes/portal.ts` — Nurse-facing portal (686 lines)
- `server/routes/referee.ts` — Referee token form
- `server/routes/preboard.ts` — Preboard assessment submission
- `server/routes/skills-arcade.ts` — Arcade routes (862 lines, full arcade API)
- `server/routes/dashboard.ts` — Dashboard stats
- `server/routes/audit.ts` — Audit trail

## Schema Compatibility Aliases

The unified `shared/schema.ts` exports compatibility aliases so each app's original import names work:
- `candidates` → `nurses` (Nurse-Onboard used "candidates")
- `magicLinks` → `portalLinks` (Nurse-Onboard used "magicLinks")
- `users` → `arcadeUsers`, `modules` → `arcadeModules` (Arcade naming)
- `assessments` → `preboardAssessments` (Preboard naming)
- All Insert types (`InsertCandidate`, `InsertMagicLink`, `InsertAuditLog`, etc.)

## Authentication

- **Local auth**: Username/password via `ADMIN_USERNAME`/`ADMIN_PASSWORD` (default: admin/admin), `TEAM_USERNAME`/`TEAM_PASSWORD`
- **Microsoft 365 SSO**: Azure AD / Entra ID OAuth2 via MSAL. Users click "Sign in with Microsoft 365" on the login page. Requires:
  - `AZURE_AD_TENANT_ID` — Azure directory/tenant ID
  - `AZURE_AD_CLIENT_ID` — App registration client ID
  - `AZURE_AD_CLIENT_SECRET` — Client secret (stored as Replit secret)
  - Redirect URI: `https://<domain>/api/auth/microsoft/callback`
- SSO sessions store `displayName`, `email`, `authMethod: "microsoft"` in the session
- The sidebar shows Microsoft badge + user display name for SSO sessions
- SSO login events are logged to the audit trail (`microsoft_sso_login` action)
- Server module: `server/msal-auth.ts`

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (Replit)
- `SESSION_SECRET` — Session signing secret
- `AZURE_AD_TENANT_ID`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET` — Microsoft SSO + email
- `AZURE_AD_SENDER_EMAIL` — Sender mailbox for outgoing emails (default: onboarding@livaware.co.uk)
- `OPENAI_API_KEY` or `AI_INTEGRATIONS_OPENAI_API_KEY` — For AI services
- `ANTHROPIC_API_KEY` — For Anthropic AI services (compliance checks)
- `REPORT_EMAIL` — Recipient for preboard assessment reports
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` — Admin credentials (default: admin/admin)
- `TEAM_USERNAME`, `TEAM_PASSWORD` — Team credentials
- Microsoft Graph / SharePoint env vars for email + document integration

## Design System

- **Colors**: Gold (#C8A96E) accent + deep navy dark theme / warm parchment light theme
- **Fonts**: Fraunces (serif headings) + Be Vietnam Pro (sans body)
- **Page header pattern**: `text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60` eyebrow + `font-serif text-2xl/3xl font-light tracking-tight` heading — consistent across all pages
- **Stat numbers**: Use `font-serif text-2xl font-light` (not bold) for elegant data display
- **Animations**: Staggered fade-in-up reveals with `animate-delay-*` utility classes; `prefers-reduced-motion` fully supported
- **Design system tokens**: `client/src/lib/design-system.ts` — BRAND colors, FONT families, DOMAIN_COLORS, GLOBAL_STYLES, GRADIENTS, GRAIN_TEXTURE (used by preboard assessment)
- **Auth hook**: `client/src/lib/auth.ts` exports `useAuth()` for arcade nurse authentication
- **Shared components**: `client/src/components/shared/step-progress.tsx` (pipeline stepper), `status-badge.tsx` (status pills), `file-upload.tsx` (drag-and-drop document upload with progress)

## Portal Flow (Nurse-Facing)

1. Admin registers nurse → `POST /api/nurses` auto-generates portal link → `preboardInviteUrl` returned
2. Nurse clicks invite link → `/portal/:token` → Portal hub shows journey (preboard/onboard/arcade)
3. Preboard "Start Assessment" → `/preboard/assessment?token=<token>` → quiz auto-fills nurse name/email from token
4. Assessment submission → `POST /api/assessments` with `portalToken` → links to nurse record via audit log
5. `GET /api/portal/:token` validates token, returns nurse info + journey status with action URLs

## Deployment

- Target: `autoscale`
- Build command: `npm run build`
- Run command: `node dist/index.cjs`
