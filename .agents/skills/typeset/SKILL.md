---
name: typeset
description: "Improve typography in web interfaces for better readability and visual appeal. Use when text is hard to read, fonts need improvement, or typographic hierarchy needs work. Triggers: typeset, typography, fonts, text styling, readable text, font pairing, type scale."
---

# Typeset

Improve typography for better readability, visual hierarchy, and aesthetic appeal.

## When to Use

- Text is hard to read or feels unprofessional
- Need to establish typographic hierarchy
- Choosing or pairing fonts
- Improving line length, spacing, or alignment

## Typography Fundamentals

### Type Scale
Use a modular scale (1.25 ratio recommended):
```css
--text-xs: 0.75rem;    /* 12px - captions */
--text-sm: 0.875rem;   /* 14px - secondary text */
--text-base: 1rem;     /* 16px - body text */
--text-lg: 1.125rem;   /* 18px - large body */
--text-xl: 1.25rem;    /* 20px - small heading */
--text-2xl: 1.5rem;    /* 24px - section heading */
--text-3xl: 1.875rem;  /* 30px - page heading */
--text-4xl: 2.25rem;   /* 36px - hero heading */
```

### Line Height
- Headings: 1.1-1.3
- Body text: 1.5-1.7
- Small text: 1.4-1.5

### Line Length
- Optimal: 50-75 characters per line
- Use `max-width: 65ch` for text containers
- Never let text run full-width on large screens

### Font Pairing
- One serif + one sans-serif (classic pairing)
- Contrast in style but harmony in proportion
- Limit to 2 fonts maximum
- Popular pairs:
  - Inter + Georgia
  - Plus Jakarta Sans + Lora
  - DM Sans + DM Serif Display

### Spacing
- Paragraph spacing: 1em to 1.5em
- Heading margin: more above than below
- Letter spacing: slight positive for uppercase, none for lowercase
- Word spacing: default is usually correct

### Hierarchy Techniques
- Size: Primary differentiator
- Weight: Bold for headings, regular for body
- Color: Dark for headings, slightly lighter for body
- Case: Uppercase only for small labels/categories
- Style: Italic for emphasis, not for decoration

## Quick Wins
1. Set `max-width: 65ch` on text containers
2. Set `line-height: 1.6` on body text
3. Use a proper type scale (not random sizes)
4. Add enough contrast between heading levels
5. Use web-safe or Google Fonts (not system defaults)
