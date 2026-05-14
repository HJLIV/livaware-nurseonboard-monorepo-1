---
name: vitest-api-tests
description: "Add or extend the Vitest API tests in `tests/NN-*.test.ts`. Covers naming, helpers, session/portal-token setup, and what to assert per feature. Use when adding any new endpoint or behaviour. Triggers: vitest, npm test, API test, integration test, tests/, helpers.ts, setup.ts."
---

# Vitest API Tests

`npm test` runs the suite. Tests live in `tests/` and are numbered
by feature group (`01-auth`, …, `27-availability`,
`28-questionnaire-dedup`). Shared helpers in
`tests/helpers.ts`; bootstrap in `tests/setup.ts`.

## Naming

- Pick the next free `NN-<short-feature-name>.test.ts`.
- Mirror the structure of the closest existing file. For a new
  portal feature: model on `tests/27-availability.test.ts`. For a
  schema gate: model on `tests/23-onboarding-access-gate.test.ts`.

## What to cover (minimum)

For a new endpoint:
- Happy path (admin-authed or portal-token-authed depending on the
  surface).
- Auth rejection: missing session → 401, wrong role → 403,
  missing/expired portal token → 401/410.
- Onboarding-gate rejection where applicable: locked write →
  `403 { error: "onboarding_locked", gate }`.
- Audit log written (read back the latest log row, assert
  `module`, `action`, `agentName`, key `detail` fields).
- Side-effects: stage transitions, auto-unlock, persisted notification
  rows, etc.

## Sessions & tokens

- Use the helpers in `tests/helpers.ts` to create candidates,
  portal links, and authenticated admin agents — do not roll your
  own login per file.
- Portal tests should exercise BOTH a real magic-link token and the
  `"me"`/`"session"` cookie path where relevant (see
  `tests/24-portal-passwordless-auth.test.ts`).
- For super-admin endpoints, ensure helpers grant
  `role: "super_admin"`; otherwise expect 403.

## Keep tests deterministic

- Do not call real OpenAI/Anthropic/Microsoft Graph from tests.
  Leave the relevant env keys unset so `is<Service>Available()`
  returns false and the fire-and-forget path is a no-op (see
  `ai-service-conventions`).
- Seed only what the test needs. Reuse the helpers' candidate
  factories.
- Avoid time-of-day flake — for window checks (e.g. 30-day
  expiry) compute dates relative to `new Date()` in the test.

## Assertions

- For matrix endpoints, assert the `MatrixResponse` shape (see
  `new-admin-report`): `columns`, `candidates[].cells[key].status
  ∈ {green, amber, red, grey}`.
- For chase flows, assert that each send writes a
  `<feature>Notifications` row AND an audit log AND the per-row
  "last chased" indicator updates.
- For availability, assert "unset" deletes the row (not writes
  `status: "unset"`).

## Running

- `npm test` runs the full suite (~100 tests).
- Add new tests to a single file when they share fixtures; create
  a new numbered file when they're a distinct feature group.

## See also

- `pre-merge-checklist` (tests must be green before mark-complete).
- `audit-trail-conventions` (what to assert on audit rows).
