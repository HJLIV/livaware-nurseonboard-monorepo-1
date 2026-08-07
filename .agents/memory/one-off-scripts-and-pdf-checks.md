---
name: One-off tsx scripts & visually checking generated PDFs
description: How to run ad-hoc scripts against server modules in this repo, and how to eyeball a generated PDF instead of guessing from extracted text.
---

## Ad-hoc `tsx` scripts

Running a throwaway script that imports server modules (`npx tsx /tmp/foo.ts`)
fails twice in a row unless you know two things:

- The esbuild loader here emits **CJS**, so `Cannot access ... top-level await`
  is thrown for any top-level `await`. Wrap the body in
  `async function main() { … } main();`.
- A script living outside the workspace cannot use relative imports
  (`./server/...`) — resolution is relative to the script file, not the cwd.
  Use absolute paths (`/home/runner/workspace/server/...`) or put the script
  inside the repo.

**Why:** both failures look like project misconfiguration but are properties of
the loader/script location, and each costs a full run to discover.

**How to apply:** whenever you need to invoke a server function directly —
backfills, one-off data fixes, rendering a sample artefact.

## Seeing what a generated PDF actually looks like

Extracted text tells you the content is present; it does not tell you the
layout is sane (overlaps, off-page content, broken tables). The container has
poppler + imagemagick on PATH:

```
pdftoppm -png -r 80 -f 1 -l 2 out.pdf /tmp/page
```

Then read the resulting `/tmp/page-1.png` with the file reader — images come
back viewable, so you can inspect the render directly.

**Why:** pdfkit silently paints past the bottom margin and happily accepts
zero/negative widths; those defects are invisible in extracted text.

**How to apply:** any time you change PDF generation, render one representative
document and look at it before declaring the work done.
