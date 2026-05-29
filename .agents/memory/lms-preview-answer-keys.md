---
name: LMS nurse-preview answer keys
description: Why admin LMS course previews must use a sanitized endpoint, not the raw admin detail route
---

The admin LMS course detail route returns quiz questions **with** `correctIndex`. Any "preview as nurse" / nurse-facing rendering must NOT use that route — it leaks the answer key in the network payload even if the UI hides it.

**Rule:** nurse-faithful previews use a dedicated sanitized endpoint (`/api/admin/lms/courses/:id/preview`) that strips `correctIndex` and returns the same shape the portal serves to a nurse (`{id,title,content,orderIndex}` lessons; `{id,prompt,options,orderIndex}` questions).

**Why:** the preview button lives outside `SuperAdminGate`, so regular admins can open it; the portal nurse route already strips `correctIndex`, and previews must match that contract.

**How to apply:** any future admin-side "see what the nurse sees" surface for quizzes/assessments must route through a sanitized endpoint, never the raw editor/detail payload.
