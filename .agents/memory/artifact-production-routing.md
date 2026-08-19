---
name: Registered artifacts vs classic deployment
description: Why a registered artifact takes down a legacy root app in production, and how to unregister one.
---

The rule: this project's main app (Express at the repo root, classic `[deployment]` build/run in `.replit`) cannot be published while ANY registered artifact exists. Keep media/source projects (like the welcome-film renderer) as plain directories, never registered artifacts.

**Why:** The moment a `.replit-artifact/artifact.toml` registration exists, publishing switches to "artifact mode" (deploy log: `artifact mode enabled runnable=0 static=1` → `static-only deployment`). In that mode the classic `[deployment] run` is NEVER executed — the Express server does not start at all. Routing is then exclusively by artifact `paths` claims: with `paths=["/"]` + catch-all rewrite the artifact served its page on every URL including `/api/*`; with `paths=[]` the domain 404'd ("This deployment has no previewable artifacts"). Both took production down. Dev shows none of this (dev routing is port-based), so the breakage only appears on publish.

**How to apply:**
- Never create/re-register an artifact in this project while the main app deploys classically. If a real second web surface is ever needed, that's a full multi-artifact migration (main app becomes an artifact too) — a deliberate project, not a config tweak.
- To unregister: `rm -rf <dir>/.replit-artifact` (shell; Edit/WriteFile tools refuse artifact.toml). The platform detects it, removes the registry entry AND its managed workflow automatically. Also remove the artifact's `[[ports]]` mapping from `.replit`.
- To edit (not remove) a registration: write the full TOML to a sibling temp file in `.replit-artifact/` and `mv` over artifact.toml.
- Config changes only take effect on the next publish; verify with curl of prod `/` and an `/api/*` route (deploy logs show whether the server actually started).
- The film itself ships as a static mp4 in the main app (`client/public/videos/`), embedded by the portal hub page — no artifact needed.
