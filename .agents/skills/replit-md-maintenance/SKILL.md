---
name: replit-md-maintenance
description: "Decide when and how to update `replit.md` after a change. It is a high-level project README with documented sections (Modules, Frontend Pages, Server Routes, Schema Aliases, Auth, Env Vars, Design System, Portal Flow, Deployment). Use whenever scope changes affect any of those sections. Triggers: replit.md, project README, document the change, update overview, project documentation."
---

# replit.md Maintenance

`replit.md` is the human-readable project README at the repo root.
It is also surfaced to the agent on every session, so accuracy
directly affects future task quality.

## When to update

Update `replit.md` when (and only when) the change adds, removes,
or meaningfully alters one of these documented sections:

- **Architecture / Key Technologies** — new top-level dep, runtime,
  or major refactor.
- **Modules** — a new feature module (e.g. "Nurse Availability
  Calendar (Task #124)" entry pattern). Add a brief 5–15 line
  block listing key files, route prefixes, audit actions, and
  test file numbers.
- **Frontend Pages** — every new admin or portal route should
  appear under the right subheading (Core, Portal,
  Compliance Matrix Reports, etc.).
- **Server Routes** — add the file under
  `server/routes/<name>.ts` with a one-line summary of what it
  exposes.
- **Schema Compatibility Aliases** — only if a new alias was
  added in `shared/schema.ts`.
- **Authentication / Roles** — any change to middleware
  semantics, role names, or local/SSO behaviour.
- **Environment Variables** — every new `process.env.*` referenced
  in committed code.
- **Design System** — only if a new shared token, hook, or
  pattern was added.
- **Portal Flow / Deployment** — only if those flows changed.

## When NOT to update

- Bug fixes that don't change the documented surface.
- Internal refactors with no API impact.
- Test-only changes.
- When the user explicitly said "do not edit replit.md" (this
  task is one such case — see Task #128).

## How to update

- Edit in place — do not reorder existing sections without a
  reason.
- Mirror the existing tone: terse, file-path-heavy, link routes to
  files.
- For new module entries, mirror the "Nurse Availability Calendar
  (Task #124)" or "Onboarding access gate (Task #94)" blocks: a
  bullet list of (a) what it does, (b) key file paths, (c) audit
  actions, (d) test file numbers.
- Keep it one source of truth — do not duplicate content into a
  new top-level doc.

## Preferences

A "User preferences" subsection may exist. Append items only when
the user explicitly asks you to remember a preference. Do not
record preferences inferred from a single interaction.

## See also

- `pre-merge-checklist` (this is its docs step).
