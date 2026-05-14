---
name: sidebar-registry
description: "Add or move pages in the admin sidebar (`sidebar-nav.tsx`) or the nurse portal sidebar (`portal-shell.tsx`) without breaking role/stage visibility. Use when surfacing a new page, hiding a feature behind a role, or adjusting portal stage gating. Triggers: sidebar, navigation, menu, portal sidebar, add page to nav, super admin only, adminOnly."
---

# Sidebar Registry

Two separate navigation registries exist and must each be edited
deliberately.

## Admin sidebar — `client/src/components/layout/sidebar-nav.tsx`

- Top-level sections are an array of `{ title, items: [...] }`.
- Per-item flags: `adminOnly`, `superAdminOnly`. Backend gating is
  authoritative — these flags only hide the link.
- Reports section pattern (verified at `sidebar-nav.tsx:84`): each
  matrix gets one entry under `Reports` with `adminOnly: true`.
- Super-admin-only entries (e.g. Chase Email Templates,
  `sidebar-nav.tsx:114`) live alongside admin entries with
  `superAdminOnly: true`; do NOT create a separate hidden section.

## Portal sidebar — `client/src/components/layout/portal-shell.tsx`

- Built by `buildPortalGroups({...})` (line ~663). Pages are passed as
  `select<Name>` callbacks and `<name>Enabled` booleans from
  `client/src/pages/portal/portal-hub.tsx`.
- Stage-gated items (e.g. `availabilityEnabled` for completed nurses,
  line ~624 / ~958) MUST be both:
  - hidden when `enabled` is false, AND
  - rendered disabled with the canonical hint text **"Locked —
    finish Assessment first"** when locked by the onboarding gate
    (see Onboarding/Compliance/Arcade entries which read the
    `gate` field returned by `GET /api/portal/:token`). Use that
    exact phrasing — do not paraphrase ("Locked", "Complete
    assessment to unlock", etc. cause UX drift).
- Never hard-code admin-only links into the portal shell; portal users
  are nurses on a magic-link / passwordless session.

## No scattered nav

Navigation entries MUST be registered in exactly one of two
places: `client/src/components/layout/sidebar-nav.tsx` (admin) or
`buildPortalGroups` in `client/src/components/layout/portal-shell.tsx`
(portal). Do NOT add ad-hoc top-level `<Link>` / `<a>` navigation
elements in individual pages or shells to surface a "global" page
— that fragments the registry, defeats role/stage filtering, and
breaks the duplicate/orphan grep checks in
`portal-admin-parity` and `pre-merge-checklist`. In-page
contextual links (e.g. a button linking to a related detail page)
are fine; sidebar-equivalent navigation is not.

## Gating matrix

### Admin sidebar (role → visibility)

| Section / item type            | `adminOnly` | `superAdminOnly` | Backend gate |
|--------------------------------|-------------|------------------|--------------|
| Dashboard, Candidates, Nurses  | true        | false            | `requireAdmin` |
| Reports/* matrices             | true        | false            | `requireAdmin` |
| Audit                          | true        | false            | `requireAdmin` |
| Settings, Policies (write)     | true        | true             | `requireSuperAdmin` |
| Chase Email Templates          | true        | true             | `requireSuperAdmin` |
| Super Admin → Activity         | true        | true             | `requireSuperAdmin` |
| `/guide`                       | true        | false            | `requireAdmin` |

### Portal sidebar (stage → group visibility)

`buildPortalGroups` reads `nurse.currentStage` and the `gate`
field from `GET /api/portal/:token`:

| Group / item             | preboard | onboard | skills_arcade | completed | Locked-by-gate? |
|--------------------------|----------|---------|---------------|-----------|-----------------|
| Assessment (preboard)    | ✅       | ✅      | ✅            | ✅        | never (it's the prerequisite) |
| Onboarding               | ❌       | ✅      | ✅            | ✅        | yes — disabled until gate unlocks |
| Compliance               | ❌       | ✅      | ✅            | ✅        | yes |
| Skills Arcade            | ❌       | ❌      | ✅            | ✅        | yes |
| Rostering → My Availability | ❌    | ❌      | ❌            | ✅        | no (stage gate only) |
| Policies to read & sign  | ✅       | ✅      | ✅            | ✅        | no |

Backend remains authoritative — the table only describes link
visibility.

## Checklist when adding a page

- [ ] Backend route registered in `server/routes.ts` with the correct
  middleware (see `stage-and-role-gating`).
- [ ] Admin entry added to the right `Reports` / `Admin` section in
  `sidebar-nav.tsx` with the matching `adminOnly` /
  `superAdminOnly` flag.
- [ ] If portal-facing, plumb `select<Name>` + `<name>Enabled` from
  `portal-hub.tsx` into `buildPortalGroups`.
- [ ] Stage-gated portal items honour `nurse.currentStage` (e.g.
  `"completed"` only for availability) and the onboarding `gate`
  field for Onboarding/Compliance/Arcade.
- [ ] Updated `replit.md` "Frontend Pages" — adding or moving a
  user-facing page is a documented surface change, so it MUST
  be reflected per the `replit-md-maintenance` and
  `pre-merge-checklist` policy.

## See also

- `stage-and-role-gating` for the middleware to wire on the server.
- `new-portal-feature`, `new-admin-report` for end-to-end flows.
