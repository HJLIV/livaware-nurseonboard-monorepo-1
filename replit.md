# Livaware NurseOnboard

Full-stack TypeScript monorepo (Express 5 + React/Vite + PostgreSQL/Drizzle) combining **Clinical-Skills-Arcade**, **Nurse-Preboard**, and **Nurse-Onboard**. Deployed on Replit autoscale.

## Run

- `npm run dev` — Express on :5000 (serves Vite)
- `npm run build` / `npm start` (prod = `node dist/index.cjs`)
- `npm run db:push` — Drizzle schema push
- `npm test` — Vitest API tests

## Architecture

- **Frontend**: `client/` — React 18, Tailwind, Radix/shadcn, Framer Motion, Recharts, RHF + Zod
- **Backend**: `server/` — Express 5, express-session, MSAL SSO, Microsoft Graph, OpenAI/Anthropic
- **Shared schema**: `shared/schema.ts` — Drizzle + Zod. FK column is `nurseId` everywhere. Compatibility aliases: `candidates → nurses`, `magicLinks → portalLinks`, `users → arcadeUsers`, `modules → arcadeModules`, `assessments → preboardAssessments`.
- **Stage terminology**: DB enum (`preboard | onboard | skills_arcade | completed`) is unchanged; UI shows display names **Applicant / Candidate / Skills Arcade / Nurse** via `STAGE_DISPLAY_NAMES`.

## Modules

- **Nurse-Onboard** (`server/routes/onboard.ts`, `portal.ts`, `referee.ts`) — AI compliance/NMC/DBS/references/certificates/passport/health-triage, Outlook + SharePoint, magic-link portal.
- **Skills Arcade** (`server/routes/skills-arcade.ts`) — 40 seeded scenarios, scoring, trainer remediation, admin reports. Platform admins bridge in via `isPlatformAdmin()`.
- **Preboard** (`server/routes/preboard.ts`) — Timed AI assessment, PDF + email.
- **Onboarding access gate** (`server/services/onboarding-gate.ts`, middleware `requireOnboardingUnlocked`) — Onboarding/Compliance/Arcade locked until 3 prerequisites (preboard examination, ≥1 competency declaration, admin CV-review). Per-nurse `onboardingUnlockMode` (`auto`/`manual`). Locked portal writes return `403 { error: "onboarding_locked", gate }`.
- **Availability** (`server/routes/availability.ts`) — `nurseAvailability(nurseId,date,shift)` unique. UI shows **Day + Night** only via `VISIBLE_SHIFTS = ["am","night"]` (legacy `pm` enum kept for historic rows). Editable window = current month + 6. Gated to `currentStage === "completed"`. Cells support left-click paint or right-click status menu. Portal page shows EWTD + double-shift safety notices. Admin matrix at `/reports/availability` + normalized CSV export.
- **Invoicing** (`server/routes/invoices.ts`) — `invoices` + `invoiceTimesheetEntries` + `invoiceAdditionalCosts`. Money in pence, hours in minutes. Status state machine: `submitted → {approved, rejected}`, `approved → {paid, rejected}`, `paid → {reconciled}`. Gated to completed nurses. Auto PDF + email to `INVOICE_RECIPIENT_EMAIL` on submit (`server/invoice-pdf.ts`, `server/outlook.ts`). Re-download: `/api/portal/:token/invoices/:id/pdf` and `/api/admin/invoices/:id/pdf`.
- **Training chase** (`server/training-notifications.ts`, `server/training-chase-scheduler.ts`) — Outstanding-module computation, editable subject/body templates with tokens (`{{NAME}} {{MODULES_LIST}} {{COUNT}} {{PORTAL_URL}} {{PORTAL_EXPIRY}}`), per-recipient secure 30-day portal link, mailbox auto-ingest of replies (high-confidence → auto-attach; low-confidence → flagged review queue). Scheduled weekly bulk + 30-min reply scan (toggleable via `/settings`).
- **Policies** (`server/routes/policies.ts`) — Admin CRUD; bumping version forces re-acknowledgement. Nurse page: `/portal/policies/:token`.
- **Super-admin Activity Dashboard** (`server/routes/super-admin.ts`) — Live audit feed + per-actor leaderboard at `/super-admin/activity`.

## Frontend Pages

**Admin core**: `/` (dashboard), `/candidates`, `/candidates/:id`, `/pipeline`, `/nurses`, `/nurses/:id`, `/preboard`, `/audit`, `/guide`, `/settings`.
**Reports**: `/reports/onboarding`, `/reports/training`, `/reports/competency`, `/reports/availability`, `/reports/invoices`, `/admin/policies`.
**Skills Arcade**: `/arcade`, `/arcade/scenario/:id`, `/arcade/walkthrough/:id`, `/arcade/trainer`, `/arcade/admin/{modules,reports,users}`.
**Portal (token-gated)**: `/portal/:token` (hub), `/portal/page/:token`, `/portal/availability`, `/portal/invoices`, `/portal/policies/:token`, `/preboard/assessment`, `/referee/:token`.
**Super-admin**: `/super-admin/activity`.

Sidebar groups (admin) live in `client/src/components/layout/sidebar-nav.tsx`. Portal sidebar groups live in `portal-shell.tsx` `buildPortalGroups` and are stage-gated (e.g. Availability + Invoices visible only when `currentStage === "completed"`).

## Authentication

- **Local**: `ADMIN_USERNAME`/`ADMIN_PASSWORD`, `TEAM_USERNAME`/`TEAM_PASSWORD`, optional `SUPER_ADMIN_USERNAME`/`SUPER_ADMIN_PASSWORD` (checked first).
- **Microsoft 365 SSO** via MSAL (`server/msal-auth.ts`). Requires `AZURE_AD_TENANT_ID`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`. Redirect: `https://<domain>/api/auth/microsoft/callback`. If `SUPER_ADMIN_EMAIL` matches the SSO email, session is auto-promoted to `super_admin`.
- **Roles**: `admin` (read all, write candidates/nurses/portal/onboard), `team` (limited), `super_admin` (exclusive write to policies, settings, arcade imports, training-chase send/scan, nurse invites). Backend gate: `requireSuperAdmin` middleware. Frontend uses `<SuperAdminGate>` + `<SuperAdminViewOnlyBanner>`.
- **Nurse portal sign-in**: `/api/portal/auth/verify-code` returns a per-nurse `portalUrl` (resolved server-side from freshest non-expired token, or freshly-minted 30-day hub token). `/api/portal/auth/portal-url` re-resolves on every relevant client touchpoint.

## Environment Variables

- `DATABASE_URL`, `SESSION_SECRET`
- `AZURE_AD_TENANT_ID`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_SENDER_EMAIL`
- `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD` / `SUPER_ADMIN_EMAIL`
- `OPENAI_API_KEY` (or `AI_INTEGRATIONS_OPENAI_API_KEY`), `ANTHROPIC_API_KEY`
- `REPORT_EMAIL` (preboard reports), `INVOICE_RECIPIENT_EMAIL` (default `invoices@livaware.co.uk`)
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `TEAM_USERNAME`, `TEAM_PASSWORD`

## Design System

- **Colors**: Gold `#C8A96E` accent, deep navy dark theme, warm parchment light theme.
- **Fonts**: Fraunces (serif headings), Be Vietnam Pro (sans body).
- **Page header**: `text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60` eyebrow + `font-serif text-2xl/3xl font-light tracking-tight` heading.
- **Stat numbers**: `font-serif text-2xl font-light` (never bold).
- **Animations**: Staggered fade-in-up with `animate-delay-*`; respects `prefers-reduced-motion`.
- **Tokens**: `client/src/lib/design-system.ts` (BRAND, FONT, DOMAIN_COLORS, GRADIENTS, GRAIN_TEXTURE).
- **Shared components**: `client/src/components/shared/` (`step-progress`, `status-badge`, `file-upload`).

## Audit

All state-changing routes log to `audit_logs` via `storage.createAuditLog({ nurseId, module, action, agentName, detail })`. Module enum (`auditModuleEnum`) and the Super-Admin Activity Dashboard expect a stable taxonomy — see the `audit-trail-conventions` skill.

## Deployment

- Target `autoscale`, build `npm run build`, run `node dist/index.cjs`.

## Project-Specific Agent Skills

Conventions live under `.agents/skills/`. Read the relevant `SKILL.md` before changing that area:

- `portal-admin-parity` — keep portal/admin write surfaces in lockstep
- `sidebar-registry` — admin (`sidebar-nav.tsx`) + portal (`portal-shell.tsx`) nav, role/stage gating
- `schema-cascade` — required order for `shared/schema.ts` changes (alias → FK → audit enum → `db:push` → storage → routes → Zod → FE → tests)
- `audit-trail-conventions` — module/action taxonomy
- `stage-and-role-gating` — middleware picker (`requireAdmin`, `requireSuperAdmin`, `validatePortalToken`, `requireOnboardingUnlocked`, `requireNurseStageCompleted`, `requireInductionAcknowledged`)
- `new-portal-feature`, `new-admin-report`, `chase-and-notification-patterns`
- `ai-service-conventions` — env precedence, fire-and-forget, `documents.aiStatus` taxonomy
- `microsoft-graph-integration`, `vitest-api-tests`, `pre-merge-checklist`, `replit-md-maintenance`
