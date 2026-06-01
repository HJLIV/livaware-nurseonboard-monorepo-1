---
name: Test-mode email suppression
description: Outbound email must be suppressed under Vitest; one module is deliberately exempt.
---

All real outbound email senders must gate on `isEmailSendingSuppressed()`
(`NODE_ENV === "test" || VITEST`). **Why:** Azure AD creds exist in the dev env,
so without a guard the test suite blasts real Microsoft Graph mail — every created
test nurse fires a welcome email, broadcasts hit every active nurse (100+ per run).
Mailbox *reads* stay live (tests depend on them).

**Exempt: the announcements module.** Its test stubs the Graph client via
`vi.mock("../server/outlook")` (spreading `...actual`, so the real
`isEmailSendingSuppressed` is kept) to drive the per-recipient failure path. A hard
suppression guard short-circuits before the stub runs and breaks that test; the
stub fully replaces the client, so no real mail escapes. **Do NOT add a suppression
guard to the announcements senders.**

**Test-data hygiene:** `tests/setup.ts` runs per-file cleanup of created
nurses/candidates so they stop accumulating. Note `DELETE /api/nurses/:id` is a
**soft delete** (archive), not a hard purge — few FKs cascade, so a hard purge is
unsafe.
