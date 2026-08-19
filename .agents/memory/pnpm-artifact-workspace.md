---
name: pnpm workspace for artifacts
description: Why artifact scaffolds fail to install and how the root pnpm-workspace.yaml fixes it without touching the npm root app.
---

Artifact scaffolds (e.g. video-js under `artifacts/*`) declare deps as `"catalog:"` versions and are driven by `pnpm --filter @workspace/<name>`. They only install if the **root** `pnpm-workspace.yaml` exists with `packages: ['artifacts/*']` and a `catalog:` section pinning every `catalog:` dep the artifact references (react, vite, tailwindcss + @tailwindcss/vite, @replit plugins, etc.).

**Why:** pnpm resolves `catalog:` versions exclusively from the workspace file; without it install fails outright.

**How to apply:** when adding a new artifact dep as `catalog:`, add the pin to the root `pnpm-workspace.yaml` catalog too. The root app itself stays npm/tailwind-v3 and is unaffected — do not migrate it.
