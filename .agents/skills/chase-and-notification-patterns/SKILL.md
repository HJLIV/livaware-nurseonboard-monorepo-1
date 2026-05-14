---
name: chase-and-notification-patterns
description: "Build chase-style email flows: per-row + bulk send, editable subject/body templates with tokens, per-recipient secure portal link, persisted notification row, mailbox auto-ingest of replies, scheduler integration. Use when adding any 'remind / nudge / notify outstanding' feature. Triggers: chase email, notify, reminder, nudge, mailbox scan, auto-ingest replies, training notification."
---

# Chase & Notification Patterns

Reference implementation: training-matrix chase emails.

- Service: `server/training-notifications.ts`
  (`computeOutstandingTrainingForNurse`, `renderChaseEmail`,
  `sendTrainingChaseEmail`, `scanMailboxForChaseRepliesAll`,
  `mintChasePortalLinkForNurse`, plus
  `TRAINING_CHASE_DEFAULT_SUBJECT` / `_BODY`).
- Routes: in `server/routes/admin-reports.ts` —
  `/api/admin/reports/training-notifications/last-chased`,
  `/prepare`, `/send`, `/scan-replies`.
- Scheduler: `server/training-chase-scheduler.ts` (1-min master
  tick, weekly bulk + periodic mailbox scan, settings persisted
  via `appSettings` key `training_chase_schedule`).
- Settings UI: `/settings`
  (`client/src/pages/admin-settings.tsx`).
- Inbox triage queue: low-confidence ingests land in the document
  review queue with `documents.aiStatus = "warning"` and
  `aiIssues` code `chase_reply_low_confidence` (see
  `applyChaseReplyTrainingUpsert` in
  `server/document-ingest.ts`).

## Required pieces for a new chase flow

1. **Outstanding-fact computation** — pure function that takes a
   nurseId and returns the items still owed. Mirror logic used by
   the matrix so red/amber cells and chase contents agree.
2. **Template** — default subject + body constants exported from
   the service module. Tokens supported by
   `training-notifications.ts`: `{{NAME}}`, `{{MODULES_LIST}}`,
   `{{COUNT}}`, `{{PORTAL_URL}}`, `{{PORTAL_EXPIRY}}`. Render via
   a `renderChaseEmail` helper; do not concat strings in
   handlers.
3. **Secure portal link per recipient** — mint a fresh time-boxed
   token (default 30 days) via a feature-specific helper modelled
   on `mintChasePortalLinkForNurse`. Never reuse an existing
   token across recipients.
4. **Send via Microsoft Graph** — see
   `microsoft-graph-integration`. Use the configured sender
   mailbox (`AZURE_AD_SENDER_EMAIL`).
5. **Persistence** — write a `<feature>Notifications` row
   (`recipientEmail`, `sentAt`, `sentBy`, `modulesIncluded` /
   payload). Surface "last chased N days ago" on the matrix.
6. **Audit** — log per send and per bulk run. See
   `audit-trail-conventions`.
7. **Reply ingest** — periodic scan of the shared mailbox.
   Auto-attach high-confidence matches; flag low-confidence into
   the existing document review queue (`aiStatus = "warning"`).
   Send an admin summary email after each bulk scan.
8. **Scheduler** — add to the existing
   `training-chase-scheduler.ts` master tick rather than spinning
   up another `setInterval`. Persist `lastXRunAt` in
   `appSettings`.

## Auth

- Send / scan / prepare endpoints require `requireSuperAdmin`.
- Read-only "last chased" map can use `requireAdmin`.
- Frontend: hide buttons via `<SuperAdminGate>`,
  `<SuperAdminViewOnlyBanner>`. Backend stays authoritative.

## Checklist

- [ ] Outstanding computation matches the matrix cell logic.
- [ ] Editable subject + body with token preview dialog.
- [ ] Per-recipient short-lived portal link minted fresh.
- [ ] `<feature>Notifications` row persisted; matrix reads it.
- [ ] Mailbox scan flags low-confidence into doc review queue.
- [ ] Scheduler entry added to existing master tick.
- [ ] Super-admin-only on send / scan / settings.

## Future scheduled notifications MUST reuse this stack

Any new scheduled / digest / reminder feature — e.g. AI weekly
summaries, reference-chase reminders, audit-integrity digests,
policy-acknowledgement nudges, expiry warnings — MUST plug into
the existing infrastructure rather than fork a new scheduler:

- Add the cadence to **`appSettings`** under a new key
  (mirroring `training_chase_schedule`). Do NOT spin up a
  separate `setInterval`.
- Register a tick inside **`server/training-chase-scheduler.ts`**
  (or rename it once a second feature lands — but keep ONE
  master 1-min tick), gated by `last<Job>RunAt` in the same
  `appSettings` JSON.
- Render the email through a **shared formatter** module that
  exposes the same `subject` / `body` / token model as
  `server/training-notifications.ts` (reuse `{{NAME}}`,
  `{{PORTAL_URL}}`, `{{PORTAL_EXPIRY}}`, etc.). Add new tokens
  as needed; do not invent a parallel templating system.
- Send via the same Microsoft Graph helper, persist a
  `*Notifications` row, and audit under the matching module.
- Surface the toggle on `/settings` next to the existing two
  jobs — never hide a scheduled job from admins.

If you find yourself writing a new `setInterval`, a new mailer,
or a new template engine, stop and reuse instead.

## See also

- `microsoft-graph-integration`, `new-admin-report`,
  `stage-and-role-gating`.
