---
name: Verifying decorative SVG scenes behind DOM text
description: Method for validating full-bleed SVG art layered under real page content (login panel etc.)
---

Full-bleed SVG scenes rendered behind DOM content cannot be validated by eyeballing screenshots: `preserveAspectRatio="slice"` crops different viewBox bands per viewport, and the DOM column layout re-maps to different scene regions per breakpoint.

**Rule:** verify with a Playwright glyph-rect audit at multiple viewports (wide desktop, small laptop, mobile): collect `getClientRects()` for every SVG `<text>` and every real DOM text element (h1/p/footer) plus opaque media (video/cards), assert zero intersections and nothing outside the viewport, then screenshot at a few animation timestamps for the visual pass.

**Why:** collisions and offscreen crops survived several review rounds when checked by screenshot inspection alone; the rect audit caught them deterministically.

**Gotcha:** windowed `stroke-dasharray` segments ("0 a len rest" on a shared path) must use butt linecaps — round caps paint stray dots at zero-length dashes.
