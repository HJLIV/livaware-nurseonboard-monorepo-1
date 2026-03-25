---
name: animate
description: "Add purposeful animations and transitions to UI components. Use when implementing motion design, page transitions, or interactive animations. Triggers: animate, animation, motion design, transitions, CSS animation, framer motion."
---

# Animate

Add purposeful, well-crafted animations and transitions to user interfaces.

## When to Use

- Implementing page or component transitions
- Adding loading and state-change animations
- Creating interactive motion feedback
- Improving perceived performance with animation

## Animation Principles

### Timing
- **Micro-interactions**: 100-200ms (button clicks, toggles)
- **Transitions**: 200-400ms (page changes, modals)
- **Emphasis**: 400-700ms (success states, attention-grabbing)
- **Complex sequences**: 700-1200ms (onboarding, tutorials)

### Easing Functions
- `ease-out`: Elements entering the screen (decelerates)
- `ease-in`: Elements leaving the screen (accelerates)
- `ease-in-out`: Elements moving between states
- `spring`: Interactive elements (natural feel)

### Common Animation Patterns

#### Fade + Slide (Entry)
```css
@keyframes slideIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
```

#### Scale (Feedback)
```css
.clickable:active {
  transform: scale(0.97);
  transition: transform 0.1s ease;
}
```

#### Skeleton Loading
```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
```

### Accessibility
- Always respect `prefers-reduced-motion`:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
- Don't convey meaning through animation alone
- Avoid rapid flashing (seizure risk)

### Performance
- Animate only `transform` and `opacity` (GPU-accelerated)
- Use `will-change` sparingly and only before animation starts
- Avoid animating `width`, `height`, `top`, `left` (triggers layout)
- Use `requestAnimationFrame` for JavaScript animations
