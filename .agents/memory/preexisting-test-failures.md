---
name: Pre-existing failing test files
description: Which Vitest files fail on a clean run and why — don't blame new work for them.
---

As of July 2026, a full `npm test` shows 22 failures across 9 files that fail even in isolation and predate current work: tests/03, 11, 13, 15, 19, 22, 24, 27, 30.

**Why:** test expectations drifted from behaviour (e.g. tests/27 T1 expects the portal availability stage gate retired but `server/routes/availability.ts` still enforces completed||grace; tests/30 expects seeded `bodyHtml`/`bodyText` defaults the email-templates API no longer returns).

**How to apply:** when validating a change, compare against this baseline (or re-run the failing file in isolation) before assuming a regression. A follow-up task exists to green the suite; delete this file once `npm test` is fully green.
