---
name: polish
description: "Refine and polish code for production readiness. Use when code works but needs cleanup, better error handling, documentation, or edge case coverage. Triggers: polish code, clean up, refine, production ready, code cleanup, finish touches."
---

# Polish

Refine working code to production quality through systematic cleanup and improvement.

## When to Use

- Code works but feels rough or incomplete
- Preparing code for production deployment
- Final pass before code review or merge
- User asks to "polish", "clean up", or "refine" code

## Polish Checklist

### Error Handling
- [ ] All error paths handled explicitly
- [ ] Meaningful error messages for users
- [ ] Errors logged with context for debugging
- [ ] Graceful degradation where appropriate
- [ ] No silent failures or empty catch blocks

### Edge Cases
- [ ] Empty/null/undefined inputs handled
- [ ] Boundary conditions tested
- [ ] Concurrent access considered
- [ ] Network failure scenarios handled
- [ ] Large input/data volume handled

### Code Quality
- [ ] No console.log or debug statements left
- [ ] No commented-out code
- [ ] No TODO/FIXME items without tracking
- [ ] Consistent naming throughout
- [ ] No magic numbers or strings

### Documentation
- [ ] Public API documented
- [ ] Complex logic has explanatory comments
- [ ] README updated if needed
- [ ] Configuration options documented

### Performance
- [ ] No unnecessary re-renders or recomputation
- [ ] Database queries optimized
- [ ] No N+1 query problems
- [ ] Appropriate caching in place
- [ ] No memory leaks

### User Experience
- [ ] Loading states shown
- [ ] Error states shown with recovery options
- [ ] Empty states handled
- [ ] Responsive design verified
- [ ] Accessibility basics covered

## Process

1. Read through the code from entry point to edges
2. Apply checklist items systematically
3. Make small, focused improvements
4. Verify each change doesn't break existing functionality
5. Run tests after all changes
