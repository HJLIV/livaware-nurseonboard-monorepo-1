---
name: stage-and-role-gating
description: "Pick the correct middleware for a new endpoint: admin/super-admin auth, portal token, onboarding-gate, stage-completed, induction-acknowledged. Use whenever you register a new server route. Triggers: requireAdmin, requireSuperAdmin, validatePortalToken, requireOnboardingUnlocked, requireInductionAcknowledged, requireNurseStageCompleted, middleware, auth gate."
---

# Stage and Role Gating

All gating middleware lives in `server/middleware.ts` (with the
onboarding gate helpers in `server/services/onboarding-gate.ts` and
the induction gate in `server/services/induction-gate.ts`).

## Decision table

| Endpoint kind | Middleware to chain |
|---|---|
| Admin read (any admin) | `requireAdmin` |
| Admin write that touches platform config (policies POST/PATCH/DELETE, settings PUT, scenario imports, user invites, training-chase send/scan) | `requireSuperAdmin` |
| Portal read (open while gated) | `validatePortalToken` |
| Portal write that mutates onboarding data | `validatePortalToken, requireOnboardingUnlocked` |
| Portal write that satisfies a prerequisite (`cv-upload`, `competency-declarations` POST) | `validatePortalToken` ONLY — do NOT add `requireOnboardingUnlocked` |
| Arcade attempt start/submit | `requireAuth, requireInductionAcknowledged` |
| Availability portal endpoints | `validatePortalToken` (server checks `currentStage === "completed"` inside the handler — see `server/routes/availability.ts`) |
| Public referee form | none (`server/routes/referee.ts` validates its own token) |

## Onboarding gate

- State source: `getGateState(nurseId)` /
  `gateStateFromNurse(nurse)` in
  `server/services/onboarding-gate.ts`.
- Three prerequisites: clinical examination (preboard assessment
  submitted), clinical competency (≥1 competency declaration), CV
  upload (admin marks CV reviewed).
- Per-nurse `onboardingUnlockMode`: `auto` (default) flips on auto;
  `manual` requires admin click. Existing nurses backfilled as
  unlocked + `manual`.
- Locked portal writes return `403 { error: "onboarding_locked",
  gate }`. `requireOnboardingUnlocked` produces this exact shape —
  do not roll your own.
- After ANY write that satisfies a prerequisite, call
  `maybeAutoUnlock(nurseId, agentName)` and audit
  `onboarding_unlocked` if it flips.

## Roles

Roles on `req.session.role`: `admin`, `team`, `super_admin`. Local
super-admin is a single fixed login (`SUPER_ADMIN_USERNAME` /
`SUPER_ADMIN_PASSWORD`) checked before regular admin. Microsoft SSO
auto-promotes when the email matches `SUPER_ADMIN_EMAIL`. See
`server/msal-auth.ts` and the auth section in `replit.md`.

## Frontend mirroring

Hide super-admin-only buttons with `<SuperAdminGate>` and show
`<SuperAdminViewOnlyBanner>` on gated pages
(`client/src/components/super-admin-only.tsx`). Backend stays
authoritative — never trust the FE flag.

## See also

- `portal-admin-parity` (which middleware on which surface).
- `audit-trail-conventions` (gate flips audit
  `onboarding_unlocked`).
