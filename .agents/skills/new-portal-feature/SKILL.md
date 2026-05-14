---
name: new-portal-feature
description: "Add a new nurse-portal feature end to end (schema → storage → routes → portal hub → portal sidebar → tests). Use when building anything the nurse will see/touch via their magic link. Triggers: portal feature, nurse-facing page, portal page, portal endpoint, portal/<token>, magic link feature."
---

# New Portal Feature (end-to-end)

Use this whenever a feature needs a nurse-facing surface behind the
portal token / portal session.

## Order of operations

1. **Schema** (`shared/schema.ts`) — see `schema-cascade`. Use
   `nurseId` for FKs. Decide if a new `auditModuleEnum` value is
   needed.
2. **Storage** — add CRUD to `server/storage.ts`.
3. **Server routes** — create `server/routes/<feature>.ts` exporting
   `register<Feature>Routes(app)`. Wire it in `server/routes.ts`
   (see existing `registerAvailabilityRoutes` at
   `server/routes.ts:191`).
4. **Gating** — see `stage-and-role-gating`. Portal writes typically
   chain `validatePortalToken, requireOnboardingUnlocked`. Reads
   stay open. Stage-only features (e.g. availability for completed
   nurses) check `currentStage` inside the handler.
5. **Audit** — `logAction(nurseId, "<module>", "<action>",
   "nurse_portal", { source: "portal", ... })`. See
   `audit-trail-conventions`.
6. **Auto-unlock** — if the new write can satisfy an Assessment-group
   prerequisite, call `maybeAutoUnlock(nurseId, "nurse_portal")`
   from `server/services/onboarding-gate.ts`.
7. **Side-effects** — for document uploads call
   `triggerSharePointUpload`, `triggerEmailNotification`,
   `triggerDocumentAnalysis` (see
   `server/sharepoint-helper.ts`, `server/document-analysis.ts`).
8. **Frontend page** — add `client/src/pages/portal/<feature>.tsx`
   (mirror layout of `client/src/pages/portal/availability.tsx`).
   Use TanStack Query with optimistic `onMutate` / rollback on
   error and an "indicator-saving" / "indicator-saved" pill.
9. **Portal hub + sidebar** — surface via `selectFoo` +
   `fooEnabled` props in `buildPortalGroups`
   (`client/src/components/layout/portal-shell.tsx`), wired from
   `client/src/pages/portal/portal-hub.tsx`. See
   `sidebar-registry`.
10. **Admin counterpart** — see `new-admin-report` and
    `portal-admin-parity`.
11. **Tests** — add `tests/NN-<feature>.test.ts`. Mirror the
    coverage shape of `tests/27-availability.test.ts` (gating,
    read/write, audit, error paths). See `vitest-api-tests`.

## Token forms

`validatePortalToken` accepts:
- a real magic-link token (one-time bootstrap, then claimed),
- the literal `"me"` / `"session"` (cookie-authenticated portal
  session — see `server/services/portal-auth.ts`).

Test both paths.

## Checklist

- [ ] New route file registered in `server/routes.ts`.
- [ ] Reads open, writes gated by `requireOnboardingUnlocked` (or
  intentionally not, with a comment).
- [ ] Audit log on every write (correct module + action +
  `source: "portal"`).
- [ ] Auto-unlock invoked if applicable.
- [ ] Portal sidebar entry added with stage / gate visibility.
- [ ] Vitest API test covers happy + locked + missing-token cases.

## Hub payload wiring

If the feature must be visible on the portal hub (status badge,
"Start" button, gate hint, count, etc.), update the
`/api/portal/:token` response shape in
**`server/routes/portal.ts`** (the `GET /api/portal/:token`
handler that builds the hub payload — search for
`buildPortalHub` / the response object containing `nurse`,
`gate`, `journey`). Add the new field, then consume it in
`client/src/pages/portal/portal-hub.tsx` AND in
`buildPortalGroups` (`portal-shell.tsx`) so the sidebar can
enable/disable the entry. Without this, the sidebar item can
appear but the hub will not reflect status.

## See also

- `schema-cascade`, `stage-and-role-gating`,
  `audit-trail-conventions`, `portal-admin-parity`,
  `sidebar-registry`, `vitest-api-tests`.
