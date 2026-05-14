---
name: new-admin-report
description: "Add a whole-roster admin matrix/report (server bulk-fetch + traffic-light cells + frontend matrix page + CSV export). Use when building a new compliance/training/competency style table. Triggers: admin report, matrix, traffic light, bulk fetch, CSV export, compliance matrix, /reports/."
---

# New Admin Report (matrix pattern)

Existing matrices to mirror:
- Onboarding: `GET /api/admin/reports/onboarding-matrix` →
  `client/src/pages/reports/onboarding-matrix.tsx`.
- Training: `GET /api/admin/reports/training-matrix` →
  `client/src/pages/reports/training-matrix.tsx`.
- Competency: `client/src/pages/reports/competency-matrix.tsx`.
- Availability: `GET /api/admin/availability/matrix` (and CSV
  export) → `client/src/pages/reports/availability.tsx`.
- SOP: `client/src/pages/reports/sop-comprehension-matrix.tsx`.

All live in `server/routes/admin-reports.ts` (or a feature-specific
file like `server/routes/availability.ts` for matrices that own
their domain).

## Server contract

```ts
type CellStatus = "green" | "amber" | "red" | "grey";
interface MatrixCell { status: CellStatus; label: string; date?: string | null; }
interface MatrixColumn { key: string; label: string; group?: string; }
interface MatrixCandidate {
  id: string; name: string; email: string;
  band: number | null; onboardStatus: string | null;
  cells: Record<string, MatrixCell>;
}
interface MatrixResponse {
  generatedAt: string;
  columns: MatrixColumn[];
  candidates: MatrixCandidate[];
}
```

ONE bulk-fetch endpoint per matrix. Do not loop per-nurse
queries — pre-fetch everything via `Promise.all` and Map by
`nurseId` (see lines 210–266 of
`server/routes/admin-reports.ts`).

## Cell semantics

Reuse the helpers in `server/routes/admin-reports.ts`:
- `documentCell(docs)` — picks best non-expired doc, mirrors AI
  status (`pass` → green, `warning` → amber, `fail` → red,
  `pending` → amber), expiry windows (≤30d amber, <0 red).
- `verificationCell(v, expiryField, presentLabel)` — for
  NMC/DBS-style verification rows.
- `profileCell(value)` — green if present, red if missing.

## Stage filter

Default the matrix to a sensible stage (availability defaults to
`stage=completed`). Accept `stage=all` to include every stage. See
`/api/admin/availability/matrix` for the pattern.

## CSV export

If the report needs to feed another system (rostering, payroll,
etc.), expose a normalized one-row-per-fact CSV at
`GET /api/admin/<feature>/export.csv`. Stable column header,
ISO dates. See `/api/admin/availability/export.csv`.

## Frontend

- Sticky header + sticky first column.
- Render cells with the 4-colour palette; show `label` on hover.
- Search box + stage filter + CSV-download button.
- For row-level actions (e.g. "Notify by email") use a side panel
  or dialog — mirror `training-matrix.tsx`.
- **Optimistic updates + Saved indicator**: any inline edit
  (e.g. side-panel availability editor, cell toggles) MUST use
  TanStack Query's `onMutate` to patch the cache, roll back on
  error, and surface progress with the shared
  `indicator-saving` → `indicator-saved` pill (see
  `client/src/pages/portal/availability.tsx` and
  `client/src/pages/reports/availability.tsx`). No full-page
  spinners on edits, no silent saves.
- Add the route to the Reports section of `sidebar-nav.tsx` (see
  `sidebar-registry`).

## Auth

`requireAdmin` for read; `requireSuperAdmin` for any write actions
(send chase, run-now, etc.). See `stage-and-role-gating`.

## Checklist

- [ ] Bulk-fetch endpoint returns the `MatrixResponse` shape above.
- [ ] Cells reuse existing helpers (or document why not).
- [ ] CSV export added if a downstream system consumes the data.
- [ ] Sidebar entry added under Reports.
- [ ] Test in `tests/` covering empty roster + at least one
  amber/red transition.

## See also

- `chase-and-notification-patterns`, `sidebar-registry`,
  `vitest-api-tests`.
