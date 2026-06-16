---
name: Request logger blind spot
description: Why error responses don't show up in this app's console logs, and how to debug 500s.
---

# Request logger blind spot

The Express request logger in `server/index.ts` prints a `[ok]` line for any
response whose JSON body is a non-array object. Error handlers in routes typically
return `res.status(500).json({ message })` — a plain object — so the failing status
and the error message are NOT distinguishable in the logs.

**Consequence:** A route that 500s appears as a normal `[ok]` entry; the actual
error text is lost.

**How to apply:** When debugging a reported 500, do not trust the request log alone.
Add an explicit `console.error` inside the route's catch block (and inside any
per-item loop catch) so the real error message/stack reaches the logs and prod
deployment logs.
