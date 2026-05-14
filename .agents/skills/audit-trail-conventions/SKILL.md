---
name: audit-trail-conventions
description: "Write audit log entries that match the existing taxonomy used by the Audit page and Super-Admin Activity Dashboard. Use when adding any state-changing endpoint or background job. Triggers: createAuditLog, logAction, audit log, audit trail, audit module, agent name, super admin activity."
---

# Audit Trail Conventions

Two writers exist; pick the right one:

- `storage.createAuditLog({ nurseId, action, agentName, detail })` —
  most route handlers use this directly (see
  `server/routes/portal.ts`, `server/routes/onboard.ts`).
- `logAction(nurseId, module, action, agentName, detail)` from
  `server/services/audit.ts` — preferred for new code; sets
  `module` explicitly. Used by `server/routes/preboard.ts`,
  `server/routes/availability.ts`.

## Required fields

- **`nurseId`** — always set when the action is about a nurse.
  Pass `null` only for system-wide events.
- **`module`** — one of `auditModuleEnum` in `shared/schema.ts`:
  `preboard | onboard | skills_arcade | admin | portal | portal_auth |
  system | availability`. Add a new value via the
  `schema-cascade` skill if a domain doesn't fit.
- **`action`** — snake_case verb_object string. Reuse existing
  actions where possible. Verified examples:
  - Portal: `portal_accessed`, `portal_candidate_updated`,
    `portal_employment_added`, `portal_document_uploaded`,
    `portal_cv_uploaded`, `portal_passport_photo_uploaded`.
  - Onboarding gate: `onboarding_unlocked`, `onboarding_relocked`,
    `cv_marked_reviewed`, `cv_review_reopened`,
    `unlock_mode_changed`.
  - Stage / system: `stage_advanced`, `super_admin_login`,
    `microsoft_sso_login`.
  - Preboard: `assessment_submitted`, `assessment_ai_rerun`,
    `assessment_email_resent`.
  - Availability: `availability_updated` (with
    `detail.source: "portal" | "admin"`).
- **`agentName`** — who acted. Conventions:
  - `"nurse_portal"` for portal token writes.
  - `req.session?.username || "admin"` for admin writes (see
    `agentNameFor` helper in `server/routes/admin-reports.ts`).
  - System job names like `"assessment_auto"`,
    `"training_chase_scheduler"` for background work.
- **`detail`** — JSON object. Include the IDs and human-readable
  fields needed by the audit page and the actor drill-down (e.g.
  `{ documentId, originalFilename, category }`). Avoid PII not
  already in the row.

## Where it surfaces

- `/audit` (admin) — `server/routes/audit.ts`.
- `/super-admin/activity` (super-admin) —
  `server/routes/super-admin.ts`. Filters operate on `module`,
  `action`, `agentName`. Choose values that filter cleanly.

## Avoid synonym drift

Do NOT invent synonyms for an existing action — the Activity
Dashboard's per-action filter and leaderboard rely on a single
canonical string per event. Pick the existing name even if it
feels slightly awkward.

| Use this (canonical)        | NOT these synonyms                        |
|-----------------------------|-------------------------------------------|
| `nurse_updated`             | `nurse_edit`, `nurse_edited`, `nurse_modified`, `candidate_updated` |
| `portal_document_uploaded`  | `portal_doc_added`, `document_upload`, `nurse_uploaded_document` |
| `onboarding_unlocked`       | `gate_opened`, `unlock_onboarding`, `onboarding_open` |
| `stage_advanced`            | `stage_changed`, `nurse_promoted`, `advance_stage` |
| `availability_updated`      | `availability_changed`, `roster_updated`, `availability_set` |
| `assessment_submitted`      | `preboard_submitted`, `quiz_completed`, `assessment_done` |
| `super_admin_login`         | `super_admin_signin`, `sa_login`, `superadmin_logged_in` |

If you genuinely need a NEW action, enumerate the existing
canonical set FIRST by grepping the actual audit-log write sites
(not arbitrary `action:` strings, which over-matches):

```bash
# Every literal action string passed to logAction / createAuditLog
rg -no --pcre2 \
  '(?:logAction|createAuditLog)\([^)]*?action:\s*"([a-z0-9_]+)"' \
  -r '$1' server/ | sort -u

# As a fallback, also check positional logAction(req, "module", "action", ...)
rg -no --pcre2 \
  'logAction\([^,]+,\s*"[^"]+",\s*"([a-z0-9_]+)"' \
  -r '$1' server/ | sort -u
```

…and only add a new string when no existing one fits.

## Common mistakes

- Writing `action: "updated"` (too vague) — always verb_object.
- Forgetting `module` and relying on default — every new endpoint
  should pass an explicit module via `logAction`.
- Logging inside a transaction that may roll back — log AFTER the
  successful DB write.
- Logging the same action twice in nested helpers. Centralise.

## See also

- `schema-cascade` (adding `auditModuleEnum` values).
- `portal-admin-parity` (matching action strings across surfaces).
