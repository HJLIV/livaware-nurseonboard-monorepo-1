---
name: Running the full Vitest suite in this workspace
description: How to actually get a full-suite result — detached runs die, tests share the dev DB and leak settings rows.
---

- The full `npm test` run exceeds the 2-minute bash tool cap, and detached runs (`nohup`, `setsid … > log`) are killed when the tool call's process group is torn down — the log stalls at `RUN v…` forever.
- **How to apply:** run vitest in chunks of ~5–9 test files per bash call (each chunk finishes well under 2 min), sequentially — never in parallel, because all tests share the dev `DATABASE_URL`.
- Tests that write `appSettings` leak rows into the dev DB (e.g. a placeholder `semble_booking_config`). After running settings-related test files, delete leaked keys from `app_settings` so admins don't see fake defaults. Prefer fixing the suite: snapshot the setting in `beforeAll` and restore it in the returned teardown.
- The dev env carries **live third-party API tokens** (e.g. Semble). Tests asserting "not configured" 503 paths silently flip to hitting the real API once a token is added. `tests/setup.ts` must `delete process.env.<TOKEN>` for any external integration the suite exercises — config helpers read env at call time, so this works even after app import.
- **Why:** burned several tool calls waiting on a detached full run that had already been killed; a leaked settings row surfaced as fake "Main Clinic" defaults in the live admin UI; adding a real Semble token broke 5 previously-green tests and made the suite query the live API.
