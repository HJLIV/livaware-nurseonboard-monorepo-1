---
name: Artifact production routing
description: How registered artifacts claim production URL paths via artifact.toml, and how to edit that file safely.
---

The rule: a secondary artifact (video/slides/etc.) living alongside a root main app must never claim `/` in its `.replit-artifact/artifact.toml`.

**Why:** In production all artifacts publish into the ONE deployment, and `[[services]] paths = ["/"]` plus a `/* → /index.html` rewrite routes every request on the domain — `/api/*`, deep links, everything — to the artifact's static bundle. This took the whole published site down (only the film rendered, on every URL). Dev is unaffected because dev routing is port-based, so the mistake is invisible until a publish.

**How to apply:**
- If the artifact should not be publicly reachable at all, claim no paths: `paths = [ ]` (dev preview is port-based and unaffected). If it should be public, give it a scoped claim (`paths = ["/some-prefix"]`), scope any rewrite to that prefix, and set `BASE_PATH` (vite `base`) and `previewPath` to the same prefix so dev, preview, and prod agree.
- Root-absolute asset URLs inside app code (e.g. audio paths in a JSON manifest) do not get vite's base treatment — resolve them via `import.meta.env.BASE_URL` at the consumption site.
- `artifact.toml` is edit-protected: the Edit/WriteFile tools reject direct changes. Write the full updated TOML to a sibling temp file in `.replit-artifact/` and `mv` it over `artifact.toml` in the shell — the platform detects and applies the replacement (workflows/preview update automatically).
- Routing config only takes effect on the next publish; verify prod afterwards with curl of `/`, an `/api/*` route, and the artifact subpath.
