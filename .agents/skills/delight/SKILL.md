---
name: delight
description: "Add delightful micro-interactions, animations, and UX touches that make interfaces feel polished and engaging. Use when enhancing user experience with subtle polish. Triggers: delight, micro-interactions, UX polish, engaging UI, surprise and delight, UI animation."
---

# Delight

Add thoughtful micro-interactions and UX touches that make interfaces feel alive and polished.

## When to Use

- UI works but feels flat or mechanical
- Adding finishing touches to a feature
- Improving perceived performance and responsiveness
- Making the interface more engaging and memorable

## Delight Patterns

### Micro-Interactions
- Button press feedback (scale, color shift)
- Hover states with smooth transitions
- Loading spinners that feel alive
- Success animations on form submission
- Smooth state transitions (collapse/expand)

### Visual Feedback
- Skeleton loading states instead of spinners
- Progress indicators for long operations
- Subtle highlight on newly added items
- Smooth scroll to new content
- Toast notifications with personality

### Motion Design Principles
- **Purposeful**: Every animation should communicate something
- **Fast**: 150-300ms for UI transitions, 300-500ms for emphasis
- **Natural**: Use easing curves, not linear motion
- **Subtle**: Less is more — avoid distracting from content
- **Consistent**: Same type of action = same type of animation

### CSS Transitions (Quick Wins)
```css
/* Smooth hover state */
.button {
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.button:active {
  transform: translateY(0);
}

/* Fade in new elements */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.new-item {
  animation: fadeIn 0.3s ease;
}
```

### Accessibility Considerations
- Respect `prefers-reduced-motion` media query
- Never rely on animation alone to convey information
- Keep animations short and non-blocking
- Provide skip options for long animations

## Implementation Priority
1. Loading and transition states (biggest perceived impact)
2. Interactive feedback (buttons, forms)
3. Content transitions (page changes, list updates)
4. Decorative touches (last — only if time permits)
