---
name: portal-admin-parity
description: "Keep nurse-portal write endpoints and admin-side equivalents in sync (auth, audit, gating, side-effects). Use when adding/changing portal or admin write routes for the same domain (documents, declarations, availability, employment, etc.). Triggers: portal endpoint, admin endpoint, parity, mirror route, dual write, candidate write, nurse write."
---

# Portal ↔ Admin Parity

**Gold-standard examples to mirror**: Task #124 (Nurse Availability
Calendar — `server/routes/availability.ts`,
`client/src/pages/portal/availability.tsx`,
`client/src/pages/reports/availability.tsx`,
`tests/27-availability.test.ts`) and Task #94 (Onboarding Access
Gate — `server/services/onboarding-gate.ts`,
`client/src/components/admin/onboarding-access-panel.tsx`,
`tests/23-onboarding-access-gate.test.ts`). Both implement portal
+ admin write surfaces with matched audit, gating, and tests —
study them first.

Many domains in this repo expose two write surfaces for the same data:
nurse-facing portal routes (`server/routes/portal.ts`,
`server/routes/availability.ts`) and admin routes
(`server/routes/onboard.ts`, `server/routes/admin.ts`,
`server/routes/availability.ts` admin block). They MUST stay in lockstep
or the audit trail and onboarding gate quietly diverge.

## Required parity per write

For every new write to a shared domain, both surfaces must agree on:

1. **Validation** — same Zod schema / shape.
2. **Audit log** — same `action` string, same `module`, same essential
   `detail` fields. Distinguish source via `detail.source: "portal"` vs
   `"admin"` (see `server/routes/availability.ts`).
3. **Step-status side-effects** — portal handlers go through
   `safeWriteStepStatuses` in `server/routes/portal.ts` (preserves
   terminal `completed` / `awaiting_verification`). Admin handlers in
   `onboard.ts` may write `stepStatuses` directly — that bypass is
   intentional for verification flows and must stay admin-only.
4. **Auto-unlock** — anything that satisfies an Assessment-group
   prerequisite (assessment submit, competency declaration, CV review)
   must call `maybeAutoUnlock(nurseId, agent)` from
   `server/services/onboarding-gate.ts`. See call sites in
   `server/routes/preboard.ts`, `server/routes/portal.ts`,
   `server/routes/onboard.ts`.
5. **Gating** — portal writes use `validatePortalToken` +
   `requireOnboardingUnlocked` (see `server/middleware.ts`). Admin
   writes use `requireAdmin` / `requireSuperAdmin`. Reads on the portal
   stay open (no `requireOnboardingUnlocked`).
6. **SharePoint / Outlook fan-out** — document writes call
   `triggerSharePointUpload`, `triggerEmailNotification`,
   `triggerDocumentAnalysis` (`server/sharepoint-helper.ts`,
   `server/document-analysis.ts`). Mirror this in both surfaces.

## Full feature-surface checklist

For any domain that has both a portal and an admin write surface,
verify every layer is mirrored:

- [ ] **DB schema** — single canonical table in `shared/schema.ts`,
  no parallel "admin_x" / "portal_x" tables. FK is `nurseId`.
- [ ] **Audit module enum** — `auditModuleEnum` in
  `shared/schema.ts` contains a value that fits the domain. If
  not, add one (see `schema-cascade`) and `npm run db:push`.
- [ ] **Portal page** — `client/src/pages/portal/<feature>.tsx`
  exists for every admin page that exposes the same data, and
  vice-versa where appropriate.
- [ ] **Admin page** — `client/src/pages/<area>/<feature>.tsx`
  exists for every portal write the admin needs to override.
- [ ] **Sidebar parity** — both `sidebar-nav.tsx` (admin) AND
  `portal-shell.tsx` (`buildPortalGroups`) link to their
  respective page. See `sidebar-registry`.
- [ ] **Server route registration** — every new portal AND admin
  route file is registered in `server/routes.ts` (mirror the
  `registerAvailabilityRoutes` wiring at `server/routes.ts:191`).
  An unregistered route file is the most common parity bug.

## Checklist before merging

- [ ] Same Zod schema referenced in both handlers.
- [ ] Same `action` + `module` in `createAuditLog` calls; only
  `detail.source` differs.
- [ ] Portal write is wrapped in `requireOnboardingUnlocked` UNLESS the
  endpoint exists specifically to satisfy an Assessment-group
  prerequisite (`cv-upload`, `competency-declarations` POST).
- [ ] If the write satisfies a prerequisite, both surfaces call
  `maybeAutoUnlock` after the DB write.
- [ ] Step-status updates use `safeWriteStepStatuses` on portal,
  direct write on admin verification flows only.
- [ ] Document fan-out (`triggerSharePointUpload` +
  `triggerEmailNotification` + `triggerDocumentAnalysis`) present on
  both, with the same `category` argument.
- [ ] Tests in `tests/` cover both surfaces (e.g. tests 23, 26, 27).

## Grep recipes

Run before declaring parity complete:

```bash
# Duplicate route paths (same method+path registered twice)
rg -n 'app\.(get|post|put|patch|delete)\("[^"]+"' server/routes/ \
  | sed -E 's/.*app\.(get|post|put|patch|delete)\("([^"]+)".*/\1 \2/' \
  | sort | uniq -d

# Duplicate sidebar entries — by href OR by label (both are bugs)
# Run for BOTH the admin sidebar AND the portal sidebar.
for f in client/src/components/layout/sidebar-nav.tsx \
         client/src/components/layout/portal-shell.tsx; do
  echo "== $f =="
  rg -n 'href: "/[^"]+"' "$f" \
    | sed -E 's/.*href: "([^"]+)".*/\1/' | sort | uniq -d
  rg -n 'label: "[^"]+"' "$f" \
    | sed -E 's/.*label: "([^"]+)".*/\1/' | sort | uniq -d
done

# Orphan sidebar entries (sidebar links to a page that doesn't exist).
# Check BOTH admin and portal nav registries.
for f in client/src/components/layout/sidebar-nav.tsx \
         client/src/components/layout/portal-shell.tsx; do
  rg -n 'href: "/[^"]+"' "$f" \
    | sed -E 's/.*href: "([^"]+)".*/\1/' | sort -u \
    | while read p; do
        rg -q "path=\"$p\"|<Route[^>]*$p" client/src/ \
          || echo "ORPHAN ($f) $p";
      done
done

# Audit-module coverage — every new write should appear here
rg -n 'logAction\(|createAuditLog\(' server/routes/ | wc -l
```

## See also

- `audit-trail-conventions` for action/module taxonomy.
- `stage-and-role-gating` for which middleware to apply.
- `new-portal-feature` and `new-admin-report` for full feature flows.
