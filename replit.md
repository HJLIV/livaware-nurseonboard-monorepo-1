# Livaware NurseOnboard Platform (Consolidated Monorepo)

## Project Overview

A full-stack TypeScript monorepo combining three private applications — **Clinical-Skills-Arcade**, **Nurse-Preboard**, and **Nurse-Onboard** — into a single Express + React/Vite platform. Uses PostgreSQL with Drizzle ORM. Deployed on Replit with autoscale.

## Architecture

- **Frontend**: React 18 + Vite, Tailwind CSS + Radix UI components, `client/`
- **Backend**: Express 5 (Node.js), `server/`
- **Shared schema**: Drizzle ORM + unified types, `shared/schema.ts` (uses `nurseId` throughout; `candidates`/`magicLinks` are aliases for `nurses`/`portalLinks`)
- **Naming convention**: Schema uses `nurseId` for FK columns. Storage/route code uses `nurseId` consistently. Legacy `candidateId` naming was fully migrated.
- **Stage terminology**: DB enum values are unchanged (`preboard`, `onboard`, `skills_arcade`, `completed`), but the UI uses display names: **Applicant** (preboard), **Candidate** (onboard), **Skills Arcade**, **Nurse** (completed). Mapping is defined in `shared/schema.ts` via `STAGE_DISPLAY_NAMES` and `getStageDisplayName()`. The legacy label "Pre-Induction" was retired everywhere in the UI in favour of "Skills Arcade" — the pipeline stage and the product surface share the same name, matching the walkthrough's self-identification as the Clinical Skills Arcade.
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

### Onboarding access gate (Task #94)
- Onboarding / Compliance / Skills Arcade are gated behind three Assessment-group items: Clinical examination (preboard assessment submitted), Clinical competency (at least one competency declaration), and CV upload (admin marks the CV as reviewed).
- Per-nurse mode toggle on `nurses.onboardingUnlockMode`: `auto` (default) flips the gate as soon as all three prerequisites are satisfied; `manual` requires an admin click. Existing nurses were backfilled as already-unlocked in `manual` mode so they aren't retroactively gated.
- Server gate: `server/services/onboarding-gate.ts` (`getGateState`, `loadGatePrerequisites`, `gateStateFromNurse`, `maybeAutoUnlock`) + `requireOnboardingUnlocked` middleware in `server/middleware.ts`. Auto-unlock is triggered on assessment submit (`server/routes/preboard.ts`), competency declaration (portal + admin), and admin CV-review.
- Locked portal write routes return `403 { error: "onboarding_locked", gate }`. Reads stay open. The Assessment-group routes (`cv-upload`, `competency-declarations` POST) are intentionally NOT gated — they are how the candidate satisfies the prerequisites.
- Admin endpoints (admin-auth required) under `/api/nurses/:id/`: `GET onboarding-access`, `POST onboarding-access/unlock`, `POST onboarding-access/relock` (requires `reason`), `PUT onboarding-access/mode`, `POST cv-review`, `DELETE cv-review`. All log audit actions: `onboarding_unlocked`, `onboarding_relocked`, `cv_marked_reviewed`, `cv_review_reopened`, `unlock_mode_changed`.
- Portal hub response `/api/portal/:token` now includes a `gate` field consumed by the sidebar (`buildPortalGroups` in `client/src/components/layout/portal-shell.tsx`) — when locked, Onboarding/Compliance/Arcade items render disabled with a "Locked — finish Assessment first" hint.
- Admin UI: `client/src/components/admin/onboarding-access-panel.tsx` is mounted on both `candidate-detail` and `nurse-detail` pages, showing prerequisite checklist, mode toggle, mark-CV-reviewed, unlock and re-lock (with reason dialog).
- Tests: `tests/23-onboarding-access-gate.test.ts` (7 tests covering gate state, manual unlock/relock, CV review, mode change audit, portal write gating, hub gate field).

### Nurse Availability Calendar (Task #124)
- New `nurseAvailability` table (`shared/schema.ts`): `(nurseId, date YYYY-MM-DD, shift)` unique. `shift ∈ {am, pm, night}`, `status ∈ {available, preferred, unavailable}` (an "unset" cell means no row). Tracks `updatedBy` + `updatedByRole` for the future rostering app.
- Editable window: current month → +6 months ahead. Only nurses with `currentStage === "completed"` see / can edit availability.
- Shift pattern: UI surfaces only **Day** + **Night** via `VISIBLE_SHIFTS = ["am", "night"]` in `shared/schema.ts` (`am` is relabelled to "Day"). The legacy `pm` enum value is preserved in the DB for historic rows but is no longer rendered in the portal grid or admin matrix. Each cell supports a left-click (apply current paint) or a right-click context menu listing every status (Available / Preferred / Unavailable / Clear). The portal page also shows two notice cards above the grid: an EWTD prompt asking nurses to declare other employment, and a safety disclaimer about back-to-back / double shifts.
- New `availability` value added to `auditModuleEnum` (DB push applied) so all availability edits are logged under their own audit module.
- Server: `server/routes/availability.ts` exposes:
  - `GET/PUT /api/portal/:token/availability` (gated to completed; `validatePortalToken`). Bulk upsert via Zod `cells: [{date, shift, status}]`; status `"unset"` deletes the row.
  - `GET /api/admin/availability/matrix?month=YYYY-MM&search=&stage=` — whole-roster matrix. `stage` defaults to `completed` (only Nurses); pass `stage=all` to include earlier-stage rows.
  - `GET /api/admin/availability/export.csv?month=YYYY-MM` — normalized one-row-per-(nurse,date,shift) CSV with header `nurse_id,name,email,date,shift,status` for direct ingestion by the future rostering app.
  - `GET/PUT /api/admin/nurses/:id/availability?month=YYYY-MM` — per-nurse editor.
- Audit logs: `availability_updated` action, module `availability`, with `detail.source` ∈ {`portal`, `admin`}.
- Frontend:
  - Portal page `client/src/pages/portal/availability.tsx` (`/portal/availability`) — month-paged table grouped by ISO week (Mon-start). Each week row carries a **Mark whole week available** button. Month-wide bulk bar: **Copy last week** (true cross-month: for every visible day, copies from `date − 7`, transparently fetching the prior month when the source date falls there) and **Clear month**. Per-cell paint mode + per-day Apply. Optimistic updates via TanStack Query `onMutate` cache patching, rollback on error, "Saved" indicator (`indicator-saving` / `indicator-saved`).
  - Admin matrix page `client/src/pages/reports/availability.tsx` (`/reports/availability`) — sticky header/column matrix with 3 status dots per day cell, **stage filter** (defaults to "Nurse (completed)", supports "All stages"), search, CSV download, click-row side-panel editor with the same optimistic + Saved UX.
  - Sidebar: new `Availability Matrix` item under Reports (`sidebar-nav.tsx`).
  - Portal sidebar: new `Rostering > My Availability` group surfaced only when `nurse.currentStage === "completed"` via `availabilityEnabled` + `selectAvailability` props in `buildPortalGroups` (`portal-shell.tsx`); `portal-hub.tsx` passes both based on stage.
- Tests: `tests/27-availability.test.ts` (11 tests covering portal gating, read/write, "unset" deletion, window enforcement, admin matrix, normalized CSV row format, admin write + audit, per-week mark-available, clear-month, admin stage filter default + `stage=all`, missing-token rejection).

### Nurse-Onboard (AI-powered compliance & onboarding)
- Full NMC PIN verification (`server/nmc-service.ts`) — step-by-step walkthrough with external link
- DBS certificate checking (`server/dbs-service.ts`) — step-by-step walkthrough with external links to gov.uk
- Editable Identity tab with edit-mode toggle, PATCH save to `/api/nurses/:id` with automatic audit trail logging
- AI compliance checks (`server/compliance-check-ai.ts`, `server/audit-summary-ai.ts`)
- Document AI analysis (`server/document-ai.ts`, `server/certificate-ai.ts`) — includes smart document classification
- Smart document upload in compliance Documents tab: AI identifies document type, category, and matches against training modules
- Training management is in the compliance section only (removed from onboarding tabs)
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

### Compliance Matrix Reports (admin only)
- `/reports/onboarding` — Onboarding & Documents matrix (candidates × personal info / core docs)
- `/reports/training` — Mandatory Training matrix (candidates × CSTF modules). Per-row "Notify by email" + bulk "Notify all" buttons send chase emails for outstanding (red/amber) modules. A preview dialog shows the editable subject + body template (tokens: `{{NAME}}`, `{{MODULES_LIST}}`, `{{COUNT}}`, `{{PORTAL_URL}}`, `{{PORTAL_EXPIRY}}`); each recipient gets a fresh 30-day secure portal upload link. Each row shows a "Last chased Nd ago" indicator. A "Scan replies" button auto-ingests new attachments from the shared inbox: confident matches against expected modules are auto-attached; low-confidence ones land in the existing flagged-document review queue (`documents.aiStatus = "warning"`, code `chase_reply_low_confidence`). An admin summary email is sent after each bulk scan.
- `/admin/policies` — Admin-managed master list of policies nurses must read & sign in their portal. Full CRUD (title/body/PDF URL/version/active/required), bumping the version forces re-acknowledgement, view per-policy acknowledgement audit list. Backed by `policies` + `policyAcknowledgements` tables and `server/routes/policies.ts`. Nurse-facing page lives at `/portal/policies/:token` and is reached via the portal sidebar's Compliance > "Policies to read & sign" item (status driven by outstanding count).
- `/settings` — Admin-only platform settings page. Currently exposes the two scheduled training-chase jobs: a weekly bulk chase (default Mondays 09:00, skips nurses chased in the last 14 days) and a periodic mailbox reply scan (default every 30 minutes). Both are individually toggleable, both reuse the exact send/scan logic the manual matrix buttons use, and both send the same admin summary emails. Backed by `appSettings` (key/value JSON, key = `training_chase_schedule`) and the `server/training-chase-scheduler.ts` master tick (1 min) which records `lastWeeklyChaseRunAt` / `lastReplyScanRunAt` per run and uses them to gate re-runs.
- `/reports/competency` — Competency & Skills Arcade matrix (candidates × competency domains + arcade modules)

### System
- `/audit` — Audit trail (admin only)
- `/guide` — Admin Guide with walkthroughs & SOPs (step-by-step procedures for all platform features)
- `/super-admin/activity` — **Super admin only** Activity Dashboard. Live audit feed (refreshes every 30s) with filters (module/action/agent/text/since/until), per-actor leaderboard, and click-through actor drill-down with per-action and per-module breakdowns. Backed by `server/routes/super-admin.ts` (`/api/super-admin/activity`, `/actors`, `/actor/:name`) reading from existing `audit_logs`.

## Server Routes

- `server/routes/admin.ts` — Nurse CRUD with preboard invite generation, advance-stage, detail sub-routes (preboard/onboard/arcade/audit-log)
- `server/routes/onboard.ts` — Full Nurse-Onboard admin (786 lines, all AI integrations)
- `server/routes/portal.ts` — Nurse-facing portal (686 lines)
- `server/routes/referee.ts` — Referee token form
- `server/routes/preboard.ts` — Preboard assessment submission
- `server/routes/skills-arcade.ts` — Arcade routes (862 lines, full arcade API)
- `server/routes/dashboard.ts` — Dashboard stats
- `server/routes/audit.ts` — Audit trail
- `server/routes/admin-reports.ts` — Whole-roster compliance matrices (onboarding/training/competency), one bulk-fetch endpoint each. Also exposes the training chase-email endpoints: `GET /api/admin/reports/training-notifications/last-chased`, `POST .../prepare`, `POST .../send`, `POST .../scan-replies`.
- `server/training-notifications.ts` — Training chase-email service: outstanding-module computation (mirrors training-matrix logic), default subject/body templates, per-nurse render + Microsoft Graph send (with secure portal link generation), persists `trainingNotifications` row + audit log, mailbox auto-ingest of replies (auto-attach high-confidence module matches; flag low-confidence into the document review queue), bulk admin summary email.

## Schema Compatibility Aliases

The unified `shared/schema.ts` exports compatibility aliases so each app's original import names work:
- `candidates` → `nurses` (Nurse-Onboard used "candidates")
- `magicLinks` → `portalLinks` (Nurse-Onboard used "magicLinks")
- `users` → `arcadeUsers`, `modules` → `arcadeModules` (Arcade naming)
- `assessments` → `preboardAssessments` (Preboard naming)
- All Insert types (`InsertCandidate`, `InsertMagicLink`, `InsertAuditLog`, etc.)

## Authentication

- **Local auth**: Username/password via `ADMIN_USERNAME`/`ADMIN_PASSWORD` (default: admin/admin), `TEAM_USERNAME`/`TEAM_PASSWORD`. Optional `SUPER_ADMIN_USERNAME`/`SUPER_ADMIN_PASSWORD` defines a single fixed super-admin login (checked before regular admin so it always wins). Local super-admin sign-in audits a `super_admin_login` action under module `system`.
- **Microsoft 365 SSO**: Azure AD / Entra ID OAuth2 via MSAL. Users click "Sign in with Microsoft 365" on the login page. Requires:
  - `AZURE_AD_TENANT_ID` — Azure directory/tenant ID
  - `AZURE_AD_CLIENT_ID` — App registration client ID
  - `AZURE_AD_CLIENT_SECRET` — Client secret (stored as Replit secret)
  - Redirect URI: `https://<domain>/api/auth/microsoft/callback`
- SSO sessions store `displayName`, `email`, `authMethod: "microsoft"` in the session
- The sidebar shows Microsoft badge + user display name for SSO sessions
- SSO login events are logged to the audit trail (`microsoft_sso_login` action). If `SUPER_ADMIN_EMAIL` matches the SSO email (case-insensitive), the session is auto-promoted to `super_admin` and audited as `super_admin_login` (module `system`).
- Server module: `server/msal-auth.ts`

### Roles

- `admin` — read access to all admin pages; can manage candidates/nurses/portal/preboard/onboard.
- `team` — limited team role.
- `super_admin` — exclusive write access to platform configuration:
  policies (POST/PATCH/DELETE), platform settings (PUT + Run-now),
  arcade scenario imports + nurse invites, training chase email
  prepare/send/scan-replies. All other admins keep read access. Backed by
  `requireSuperAdmin` middleware (`server/middleware.ts`). The frontend
  hides the relevant action buttons via `<SuperAdminGate>` and shows a
  `<SuperAdminViewOnlyBanner>` on gated pages — backend remains the
  authoritative gate (returns 403 with "Super admin access required").
- The sidebar shows an `SA` badge next to the role label and surfaces a
  "Super Admin" section with the **Activity Dashboard**.

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (Replit)
- `SESSION_SECRET` — Session signing secret
- `AZURE_AD_TENANT_ID`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET` — Microsoft SSO + email
- `SUPER_ADMIN_USERNAME`, `SUPER_ADMIN_PASSWORD` — single fixed super-admin local login (optional; if unset, no local super-admin)
- `SUPER_ADMIN_EMAIL` — email that, when matched on Microsoft SSO sign-in, auto-promotes the session to `super_admin`
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

## Project-Specific Agent Skills

Authoritative repo conventions live as agent skills under `.agents/skills/`.
Read the relevant SKILL.md before making changes in that area — they
encode the exact files, middleware, audit names, gating, grep recipes,
and pre-merge checks this monorepo expects.

- `portal-admin-parity` — Keep nurse-portal and admin write surfaces in
  lockstep (auth, audit, gating, side-effects, sidebar).
- `sidebar-registry` — Add/move pages in `sidebar-nav.tsx` (admin) or
  `portal-shell.tsx` `buildPortalGroups` (portal); role/stage gating
  matrix; canonical "Locked — finish Assessment first" wording.
- `schema-cascade` — Required order for any change to `shared/schema.ts`
  (alias, nurseId FK, audit enum, `db:push`, storage, routes, Zod, FE
  types, tests).
- `audit-trail-conventions` — Module/action taxonomy, anti-synonym rules,
  what the Audit page and Super-Admin Activity Dashboard expect.
- `stage-and-role-gating` — Pick the right middleware (`requireAdmin`,
  `requireSuperAdmin`, `validatePortalToken`, `requireOnboardingUnlocked`,
  `requireNurseStageCompleted`, `requireInductionAcknowledged`).
- `new-portal-feature` — End-to-end recipe for any nurse-portal feature
  (schema → storage → routes → portal hub payload → portal sidebar →
  tests).
- `new-admin-report` — Whole-roster matrix/report flow (server bulk
  fetch + traffic-light cells + matrix page + CSV export + optimistic
  Saved-indicator UX).
- `chase-and-notification-patterns` — Chase emails, secure portal links,
  mailbox auto-ingest, scheduler reuse for any future scheduled
  notification.
- `ai-service-conventions` — OpenAI/Anthropic env precedence, availability
  checks, fire-and-forget pattern, terminal status taxonomy
  (`documents.aiStatus` + `aiIssues` codes), no-silent-fallback rule,
  re-run auditability.
- `microsoft-graph-integration` — sendMail / mailbox scan / SharePoint
  upload / MSAL SSO patterns and required env vars.
- `vitest-api-tests` — Naming, helpers, session/portal-token setup, what
  to assert per feature in `tests/NN-*.test.ts`.
- `pre-merge-checklist` — Final review pass before `mark_task_complete`
  (build, `db:push`, tests, sidebar, audit, gating, replit.md, `/guide`).
- `replit-md-maintenance` — When and how to update this file.
