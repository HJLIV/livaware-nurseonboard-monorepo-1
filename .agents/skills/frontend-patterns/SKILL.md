---
name: frontend-patterns
description: "Common frontend architecture patterns and best practices. Use when designing client-side code, component structures, state management, or UI architecture. Triggers: frontend architecture, component design, state management, UI patterns, React patterns, Vue patterns."
---

# Frontend Patterns

Reference guide for common frontend architecture patterns and best practices.

## When to Use

- Structuring a frontend application
- Designing component hierarchies
- Choosing state management approaches
- Reviewing frontend architecture

## Component Architecture

### Component Types
- **Page/View**: Route-level components, minimal logic
- **Container**: Data fetching, state management, no UI
- **Presentational**: Pure UI, receives data via props
- **Layout**: Page structure (header, sidebar, content)
- **Shared/Common**: Reusable across features (Button, Modal, Input)

### Component Guidelines
- Single responsibility — one reason to change
- Props down, events up
- Keep components small (<200 lines)
- Extract hooks/composables for reusable logic
- Co-locate related files (component, styles, tests)

## State Management

### Local State
- Component-specific UI state (open/closed, form values)
- Use framework primitives (useState, ref, signal)

### Shared State
- State needed by multiple components
- Lift state to nearest common ancestor
- Consider context/providers for deeply nested access

### Server State
- Data from API calls
- Use dedicated libraries (React Query, SWR, Apollo)
- Handle loading, error, and stale states
- Cache and invalidate appropriately

### Global State
- App-wide state (user session, theme, permissions)
- Keep minimal — most state is local or server state
- Use stores (Zustand, Pinia, Redux) only when needed

## Common Patterns

### Form Handling
- Controlled components with validation
- Debounce expensive validations
- Show errors on blur or submit, not on every keystroke
- Disable submit during processing
- Handle optimistic updates

### Error Boundaries
- Catch rendering errors at feature boundaries
- Show meaningful fallback UI
- Log errors for debugging
- Allow retry/recovery

### Code Splitting
- Route-based splitting (lazy load pages)
- Feature-based splitting for large modules
- Preload critical paths

### Performance
- Memoize expensive computations
- Virtualize long lists
- Debounce/throttle event handlers
- Optimize images (lazy load, responsive sizes)
- Minimize re-renders
