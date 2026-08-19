---
name: pnpm workspace for artifacts
description: How artifacts under artifacts/* must be installed (isolated pnpm) so they build during a publish without hijacking the npm-managed root app.
---

Artifacts under `artifacts/*` are pnpm projects driven by `pnpm --filter @workspace/<name> run <script>`; the root app stays npm. Install each artifact **in isolation** (`pnpm install --ignore-workspace` inside the artifact directory), never with a workspace-wide or `--filter` install from the repo root.

**Why:** a root-level pnpm install — even filtered to one artifact — reclaims the workspace-root `node_modules`: it moves npm-installed packages to `node_modules/.ignored` and relinks them through a pnpm store. The root app's production bundle externalizes almost all of its dependencies, so that quietly rewrites what production resolves at runtime. Isolated installs leave the root untouched (verified experimentally). The consequence is that `catalog:` specifiers cannot be used — catalogs only resolve inside a workspace install — so artifact `package.json` files must pin real version ranges; the root `pnpm-workspace.yaml` remains only so `pnpm --filter` can locate the package.

**How to apply:** keep every artifact install going through the repo's artifact-install script (isolated, `--prod=false` because artifact build tooling lives in devDependencies and deploy builds may set `NODE_ENV=production`). Deployment installs only ever run `npm install` at the root, so the root build command must trigger the artifact install itself — otherwise the platform's artifact build step fails the whole publish with a missing-package error. The same applies after a task merge: the merged artifact arrives without `node_modules`.
