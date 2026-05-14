---
name: schema-cascade
description: "Safely add or rename Drizzle schema in `shared/schema.ts` so storage, routes, tests, and the FE stay in sync. Use when adding a table/column, changing an enum, or renaming a field that is exported via the candidates/magicLinks aliases. Triggers: drizzle schema, add column, add table, db:push, enum value, rename field, shared/schema.ts."
---

# Schema Cascade

`shared/schema.ts` is the single source of truth for tables, enums,
Insert/Select types, and compatibility aliases (`candidates → nurses`,
`magicLinks → portalLinks`, `users → arcadeUsers`,
`assessments → preboardAssessments`).

## Required cascade for every schema change (in order)

The order below is mandatory — `db:push` runs early so dependent
storage / route / FE work can rely on the live DB shape:

1. **Edit `shared/schema.ts`**:
   - Add the table/column/enum value.
   - Export `Insert<X>` and `<X>` types via `createInsertSchema` /
     `$inferSelect`.
   - If the schema is the canonical name (e.g. `nurses`), add a
     compat alias. Existing aliases include `candidates → nurses`,
     `magicLinks → portalLinks`, `users → arcadeUsers`,
     **`modules → arcadeModules`**, `assessments →
     preboardAssessments`. Mirror this pattern.
2. **Always use `nurseId`** as the FK column name. Legacy
   `candidateId` was fully migrated; do not re-introduce it.
3. **Audit module enum**: when a feature deserves its own audit
   bucket, add a value to `auditModuleEnum` (current values include
   `preboard`, `onboard`, `skills_arcade`, `admin`, `portal`,
   `portal_auth`, `system`, `availability`).
4. **DB push**: `npm run db:push`. Replit's database is the live
   instance — there is no manual SQL migration file. Run this
   BEFORE writing storage / routes that depend on the new shape.
5. **Storage**: add CRUD methods to `server/storage.ts` (or the
   feature-specific storage like `server/arcade-storage.ts`,
   `server/preboard-storage.ts`).
6. **Routes**: wire endpoints; see `new-portal-feature` /
   `new-admin-report`.
7. **Zod validators**: extend or add the `insert<X>Schema` /
   request validators co-located in `shared/schema.ts` (or the
   route module). Both portal and admin handlers must validate
   through the SAME schema — see `portal-admin-parity`.
8. **Frontend types**: types flow from `shared/schema.ts` directly
   (`import type { Foo } from "@shared/schema"`). Update any
   hand-written form types in `client/src/` that mirror the
   schema shape, and any TanStack Query response types. Run a
   build to catch drift.
9. **Tests**: extend the relevant `tests/NN-*.test.ts` (Vitest API
   tests).

## Renames

- Renaming a column requires updating: `shared/schema.ts`,
  `server/storage.ts`, every `server/routes/*.ts` consumer,
  `client/src/` usages, and tests. Search with
  `rg -n "<oldName>" shared server client tests`.
- Prefer additive changes (new column + dual-write + later drop) over
  in-place renames in a live DB.

## Compatibility aliases

When code in `server/routes/onboard.ts` or `server/routes/portal.ts`
imports `candidates` or `magicLinks`, those are aliases — edits to the
underlying `nurses` / `portalLinks` table apply automatically. Do not
duplicate columns onto the alias.

## Stage terminology

DB enum values are unchanged: `preboard`, `onboard`, `skills_arcade`,
`completed`. UI labels (`Applicant`, `Candidate`, `Skills Arcade`,
`Nurse`) are mapped through `STAGE_DISPLAY_NAMES` /
`getStageDisplayName()` in `shared/schema.ts`. Do not rename DB enum
values to match the UI.

## Checklist

- [ ] `shared/schema.ts` updated, types exported, alias added if
  needed.
- [ ] `auditModuleEnum` extended if the feature needs its own bucket.
- [ ] `server/storage.ts` (or feature storage) has CRUD.
- [ ] `npm run db:push` run.
- [ ] All `rg`-found usages of any renamed identifier updated.
- [ ] Vitest API tests added/updated.

## See also

- `audit-trail-conventions`, `vitest-api-tests`.
