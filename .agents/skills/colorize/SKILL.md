---
name: colorize
description: "Design and apply color systems to UI components. Use when creating color palettes, fixing color inconsistencies, or implementing dark/light themes. Triggers: colorize, color palette, color scheme, dark mode, light mode, theme colors, color system."
---

# Colorize

Design cohesive color systems and apply them consistently across interfaces.

## When to Use

- Establishing a color palette for a new project
- Fixing inconsistent color usage
- Implementing dark/light mode
- Improving color contrast and accessibility

## Color System Design

### Core Palette Structure
- **Primary**: Brand color, used for CTAs and key elements
- **Secondary**: Supporting color, used for less prominent actions
- **Neutral**: Grays for text, borders, backgrounds
- **Success**: Green tones for positive states
- **Warning**: Yellow/amber for caution states
- **Error**: Red tones for error states
- **Info**: Blue tones for informational states

### Generating Shades
For each color, generate 9 shades (50-900):
- 50: Lightest (backgrounds)
- 100-200: Light (hover states, subtle backgrounds)
- 300-400: Medium (borders, icons)
- 500: Base color
- 600-700: Dark (text on light backgrounds)
- 800-900: Darkest (headings, high contrast)

### CSS Custom Properties
```css
:root {
  --color-primary-50: #eff6ff;
  --color-primary-500: #3b82f6;
  --color-primary-900: #1e3a5f;
  --color-neutral-50: #f9fafb;
  --color-neutral-500: #6b7280;
  --color-neutral-900: #111827;
  --color-success-500: #22c55e;
  --color-error-500: #ef4444;
}

[data-theme="dark"] {
  --color-neutral-50: #111827;
  --color-neutral-500: #9ca3af;
  --color-neutral-900: #f9fafb;
}
```

### Accessibility Requirements
- Text on backgrounds: minimum 4.5:1 contrast ratio (WCAG AA)
- Large text: minimum 3:1 contrast ratio
- UI components: minimum 3:1 against adjacent colors
- Don't rely on color alone to convey meaning

### Application Rules
- Maximum 3 colors on any single screen (plus neutrals)
- Use color consistently (same color = same meaning)
- 60-30-10 rule: 60% neutral, 30% secondary, 10% primary
- Test with colorblind simulation tools
