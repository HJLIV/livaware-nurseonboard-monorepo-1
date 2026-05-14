---
name: microsoft-graph-integration
description: "Send mail, scan a mailbox, upload to SharePoint, and authenticate users via Microsoft Graph / MSAL. Use when adding email-out, mailbox-in, file storage, or SSO features. Triggers: Microsoft Graph, Outlook, SharePoint, MSAL, Azure AD, sendMail, attachment, sign in with Microsoft, AZURE_AD_."
---

# Microsoft Graph / MSAL Integration

## Modules

- Auth (SSO + token acquisition): `server/msal-auth.ts`.
- Outbound email: `server/outlook.ts` (high-level senders),
  `server/preboard-outlook.ts` (preboard report email),
  `server/training-notifications.ts` (chase emails).
- SharePoint upload: `server/sharepoint.ts`,
  `server/sharepoint-helper.ts`
  (`triggerSharePointUpload`, `triggerEmailNotification`).

## Required env

- `AZURE_AD_TENANT_ID`
- `AZURE_AD_CLIENT_ID`
- `AZURE_AD_CLIENT_SECRET` (Replit secret)
- `AZURE_AD_SENDER_EMAIL` (default: onboarding@livaware.co.uk)
- Redirect URI:
  `https://<domain>/api/auth/microsoft/callback`

Use `isOutlookConfigured()` (see imports in
`server/routes/admin-reports.ts:18`) before sending — degrade with
a 4xx/log when unconfigured. Never crash on missing creds.

## Sending mail

- Always send via `AZURE_AD_SENDER_EMAIL` (the shared mailbox), not
  the SSO user's mailbox. Recipients must be addressable by the
  application identity.
- Render templated bodies through a `render*` helper (see
  `renderChaseEmail` in `server/training-notifications.ts`) — do
  not string-concat HTML in handlers.
- For per-recipient secure links, mint a fresh short-lived token
  (see `mintChasePortalLinkForNurse` for the pattern). Never share
  one token across recipients.
- Audit each send with the recipient + subject summary
  (`audit-trail-conventions`).

## Scanning the mailbox

- One scanner per inbound flow (currently only training chase
  replies — `scanMailboxForChaseRepliesAll`).
- Confident matches → auto-attach via `applyChaseReplyTrainingUpsert`
  (`server/document-ingest.ts`).
- Low-confidence → flag into the document review queue with
  `documents.aiStatus = "warning"` and `aiIssues` code
  `chase_reply_low_confidence`. Don't invent a parallel queue.
- Send an admin summary email after each bulk scan with the counts.

## SharePoint

- Document uploads (portal + admin) call
  `triggerSharePointUpload(docId, nurseId, filePath, filename,
  category)` AND `triggerEmailNotification(...)`. Both are
  fire-and-forget — see `ai-service-conventions` for the pattern.
- Required on both portal and admin write paths
  (`portal-admin-parity`).

## SSO

- Local super-admin (`SUPER_ADMIN_USERNAME` /
  `_PASSWORD`) is checked before regular admin so it always wins.
- Microsoft SSO auto-promotes the session to `super_admin` when
  `SUPER_ADMIN_EMAIL` matches the SSO email (case-insensitive).
- SSO sessions store `displayName`, `email`, `authMethod:
  "microsoft"`. Audit `microsoft_sso_login` (and
  `super_admin_login` on auto-promote) under module `system`.

## Checklist for new mail/file features

- [ ] Guarded by `isOutlookConfigured()` (or equivalent) check.
- [ ] Sent from `AZURE_AD_SENDER_EMAIL`.
- [ ] Templates rendered via a `render*` helper, never inline.
- [ ] Per-recipient secure links minted fresh.
- [ ] Audit log written (action + module + recipient detail).
- [ ] Scheduler integration via the existing master tick if
  recurring (see `chase-and-notification-patterns`).

## See also

- `chase-and-notification-patterns`, `ai-service-conventions`,
  `audit-trail-conventions`.
