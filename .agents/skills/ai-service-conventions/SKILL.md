---
name: ai-service-conventions
description: "Add or modify AI-backed services (compliance, document, certificate, CV, NMC, DBS, reference, health triage, audit summary, dashboard). Covers env keys, availability checks, fire-and-forget patterns, error handling. Use when calling OpenAI/Anthropic from the server. Triggers: AI service, OpenAI, Anthropic, document AI, compliance check, health triage, fire and forget, AI background job."
---

# AI Service Conventions

AI modules live alongside their domain in `server/`:
- `server/compliance-check-ai.ts`, `server/audit-summary-ai.ts`,
  `server/dashboard-ai.ts`
- `server/document-ai.ts`, `server/certificate-ai.ts`,
  `server/cv-ai.ts`, `server/personal-info-extract-ai.ts`,
  `server/reference-ai.ts`, `server/reference-extract-ai.ts`,
  `server/health-triage-ai.ts`, `server/preboard-ai.ts`,
  `server/passport-parser.ts`
- Orchestrators: `server/document-analysis.ts`,
  `server/document-ingest.ts`, `server/document-extractor.ts`

## Env / availability

Two key sets are accepted (see `replit.md` env list):
- OpenAI: read `OPENAI_API_KEY` first, fall back to
  `AI_INTEGRATIONS_OPENAI_API_KEY` if unset. Never read both and
  prefer the integrations key — direct env always wins so manual
  overrides are predictable.
- `ANTHROPIC_API_KEY`.

Every AI module exports an `is<Service>Available()` (or equivalent)
that returns `false` when its key is unset. Callers MUST check this
and degrade gracefully — never throw because AI is unconfigured.
See `isTriageAvailable()` used by
`triageHealthDeclarationInBackground` in
`server/routes/portal.ts:78`.

## Fire-and-forget pattern

Long-running AI calls are dispatched from request handlers without
blocking the HTTP response. Pattern (verified at
`server/routes/portal.ts:78–103`):

```ts
function triageInBackground(rec) {
  if (!isTriageAvailable()) { console.log("[X] Skipped — AI not configured"); return; }
  doAiCall(rec)
    .then(async (result) => { await persist(rec.id, result); })
    .catch(async (err) => {
      console.error("[X] Failed:", err.message);
      try { await markSkipped(rec.id); } catch (e) { console.error("[X] Could not mark skipped:", e.message); }
    });
}
```

Required behaviours:
- Always persist a terminal status (`pass | warning | fail |
  pending | skipped`) so the UI doesn't spin forever.
- Catch and swallow errors at the top level — never let an AI
  rejection unwind into an unhandled promise.
- Tag console logs with `[<Service>]` for greppability.

## Document analysis fan-out

Document uploads should call:
- `triggerDocumentAnalysis(docId, filePath, mimeType, category,
  type, nurseId)` — runs document AI in the background.
- `triggerSharePointUpload(...)` and `triggerEmailNotification(...)`
  — see `microsoft-graph-integration`.

These are fire-and-forget in both portal and admin handlers (parity
required — see `portal-admin-parity`).

## AI status taxonomy

The canonical column for document AI verdicts is
**`documents.aiStatus`** in `shared/schema.ts`, with values:

- `pending` — analysis queued.
- `pass` — no issues.
- `warning` — review needed (renders amber on matrices).
- `fail` — issues found (renders red).
- `skipped` — AI unavailable / not applicable.

Structured details belong in the sibling **`documents.aiIssues`**
JSONB column as an array of `{ code, ... }` objects. The repo's
established convention is a stable snake_case `code`, e.g. the
chase-reply ingest path writes
`{ code: "chase_reply_low_confidence", ... }` so the matrix +
review queue can filter on it (see `applyChaseReplyTrainingUpsert`
in `server/document-ingest.ts` and the matrix query in
`server/routes/admin-reports.ts` ~line 489 that filters on
`@> '[{"code":"chase_reply_low_confidence"}]'::jsonb`). When you
add a new warning kind, add a new `code` — do not overload an
existing one.

Matrix cell helpers (`documentCell`, `verificationCell` in
`server/routes/admin-reports.ts`) already encode this — do not
invent new statuses.

## Pre-checks

Cheap pre-checks (e.g. `preCheckCv` in `server/cv-ai.ts`) run
before paying for a model call to reject obvious wrong-document
uploads with a 400. Always log a `*_rejected` audit action with
`reason` + `details` (see
`server/routes/portal.ts` cv-upload handler).

## No silent fallbacks

Background fire-and-forget jobs MUST contain their own
exceptions (so an AI failure never crashes the request) BUT they
MUST NOT swallow errors silently. Every terminal failure is:

- persisted to the row's status/issues columns (e.g.
  `documents.aiStatus = "fail"` with a `code` in `aiIssues`),
- written to the audit log with a `*_failed` action and a
  human-readable `detail.reason`,
- surfaced to the user the next time they load the relevant page
  — admin matrices render the failed status as a red cell, the
  candidate detail page shows the reason, and the portal hub
  shows a retry affordance where applicable.

If the user-visible surface would otherwise show "still pending"
forever, the job has not been handled correctly. Pretending an AI
call succeeded is never acceptable.

## Re-runs must be auditable

Every AI invocation that an admin can re-trigger (e.g. preboard
`rerun-ai`, `resend-email`, document re-analysis, compliance
re-check) MUST write an audit log — both on the original run AND
on each re-run — with:

- a distinct `action` per kind (`assessment_ai_rerun`,
  `assessment_email_resent`, etc. — see `audit-trail-conventions`),
- `agentName` = the admin's session username,
- `detail` including the target id and the new terminal status.

Background fire-and-forget runs audit on completion (success or
terminal failure). Never silently retry an AI step without a log
row — the Activity Dashboard relies on these to attribute spend
and explain status changes.

## Tests

AI calls are not invoked from `tests/`. Stub by ensuring keys are
unset in the test env so `is<Service>Available()` returns false
and the fire-and-forget path no-ops with a "skipped" terminal
state.

## See also

- `microsoft-graph-integration`, `audit-trail-conventions`,
  `portal-admin-parity`.
