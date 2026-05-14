---
name: pre-merge-checklist
description: "Final review pass before marking a task complete in this monorepo: build, db push, tests, sidebar, audit, gating, replit.md. Use immediately before `mark_task_complete`. Triggers: pre-merge, ready to merge, ship it, before completion, final checks, mark complete."
---

# Pre-Merge Checklist

Run through this list before calling `mark_task_complete`. Skip
items that genuinely don't apply (and note why in the commit
message).

## Build & types

- [ ] `npm run build` passes (esbuild + Vite). No TS errors.
- [ ] LSP diagnostics clean for all touched files (use the
  `diagnostics` skill).

## Schema & DB

- [ ] If `shared/schema.ts` changed: `npm run db:push` was run.
- [ ] New `auditModuleEnum` values are present in the live DB.
- [ ] Compatibility aliases (`candidates`, `magicLinks`, etc.)
  still resolve.

## Routes

- [ ] Every new route registered in `server/routes.ts`.
- [ ] Correct middleware chain per `stage-and-role-gating`.
- [ ] Portal write endpoints either gate with
  `requireOnboardingUnlocked` or are intentionally listed as
  Assessment-prerequisite endpoints (with a comment).
- [ ] `maybeAutoUnlock` invoked anywhere a prerequisite is
  satisfied.

## Audit

- [ ] Every state-changing endpoint writes an audit log via
  `logAction` or `storage.createAuditLog` with
  `module + action + agentName + detail`.
- [ ] Action names match existing taxonomy or are new
  verb_object snake_case.

## Grep recipes (run these)

```bash
# Duplicate route paths
rg -n 'app\.(get|post|put|patch|delete)\("[^"]+"' server/routes/ \
  | sed -E 's/.*app\.(get|post|put|patch|delete)\("([^"]+)".*/\1 \2/' \
  | sort | uniq -d

# Orphan sidebar entries (link with no matching <Route>) — admin AND portal
for f in client/src/components/layout/sidebar-nav.tsx \
         client/src/components/layout/portal-shell.tsx; do
  rg -n 'href: "/[^"]+"' "$f" \
    | sed -E 's/.*href: "([^"]+)".*/\1/' | sort -u \
    | while read p; do
        rg -q "path=\"$p\"|<Route[^>]*$p" client/src/ \
          || echo "ORPHAN ($f) $p";
      done
done

# Duplicate sidebar hrefs and labels — admin AND portal
for f in client/src/components/layout/sidebar-nav.tsx \
         client/src/components/layout/portal-shell.tsx; do
  echo "== $f =="
  rg -n 'href: "/[^"]+"' "$f" \
    | sed -E 's/.*href: "([^"]+)".*/\1/' | sort | uniq -d
  rg -n 'label: "[^"]+"' "$f" \
    | sed -E 's/.*label: "([^"]+)".*/\1/' | sort | uniq -d
done
```

Both must return empty output before merging.

## /guide reflection

- [ ] If the change introduces a new admin-facing workflow or SOP,
  update `client/src/pages/admin-guide.tsx` (the `/guide` page)
  with a short walkthrough so the user-facing reflection of the
  feature is current. Skip if the change is not user-visible.

## Frontend

- [ ] New page entries added to `sidebar-nav.tsx`
  (admin) or `portal-shell.tsx` via `buildPortalGroups`
  (portal). See `sidebar-registry`.
- [ ] Super-admin-only buttons wrapped in `<SuperAdminGate>`;
  banner on gated pages.
- [ ] Page header eyebrow + serif heading pattern followed
  (replit.md "Design System").

## Tests

- [ ] `npm test` passes.
- [ ] New endpoint has at least happy + 401/403 + audit
  assertions (`vitest-api-tests`).

## Docs

- [ ] If the change adds or alters a user-facing surface (new
  module, route, page, env var, role behaviour), `replit.md`
  MUST reflect it — confirm the relevant section
  (Modules / Frontend Pages / Server Routes / Env Vars / Auth)
  is up to date. Use the `replit-md-maintenance` skill.
- [ ] If the change adds or alters an admin-facing workflow,
  `client/src/pages/admin-guide.tsx` (the `/guide` page) MUST
  reflect it. Confirm the walkthrough is current.
- [ ] Skip both only when the change has no user-visible or
  surface-changing effect (pure refactor, bug fix without API
  change, test-only). State the reason in the commit message.

## Commit message

Write `.local/.commit_message` (≤30 lines): original task,
deviations, key files touched.

## Follow-ups

Before `mark_task_complete`, propose follow-ups via the
`follow-up-tasks` skill (one-shot per task). Skip if downstream
tasks already cover the work.

## See also

- All other skills in this set; this is the convergence point.
