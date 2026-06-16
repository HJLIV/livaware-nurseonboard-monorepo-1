---
name: Arcade bulk backfill resilience
description: Why the Skills Arcade enrol-all / auto-enrol path must isolate per-nurse failures and dedupe by username, not just email.
---

# Arcade bulk backfill resilience

**Rule:** Any bulk loop over nurses that mints arcade users + enrols modules
(`POST /api/admin/enrol-all`, auto-enrol helpers in `server/routes/skills-arcade.ts`)
must wrap each iteration in try/catch → log + push to `skippedNurseIds` + `continue`.
A single bad record must never 500 the whole run.

**Username UNIQUE gotcha:** `arcade_users.username` is UNIQUE and is set equal to the
nurse's lowercased email when an account is minted. If two nurse records share an
email (real data-quality issue seen in prod, e.g. duplicate test rows), the
email lookup may miss but `createUser` then collides on the username constraint.
`ensureArcadeUserForNurse` must fall back to `getUserByUsername(email)` before
`createUser`, and return `null` (skip) when the nurse has no email at all
(both `username` and `email` are NOT NULL).

**Why:** A prod "Enrol All Nurses" 500 could not be reproduced by static reading —
the handler *should* have returned 200 on the data. The real defect was structural:
no per-nurse isolation + no error logging meant any single failing/edge record
silently aborted the entire backfill. The endpoint already exposes a
`skippedNurseIds` contract, which implies partial-success semantics were intended.

**How to apply:** When touching any nurse→arcade-user provisioning or bulk
enrolment, keep the per-item try/catch, keep the username fallback, and never let
`ensureArcadeUserForNurse` throw on missing/duplicate identity data.
