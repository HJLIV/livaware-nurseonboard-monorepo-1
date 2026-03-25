---
name: clarify
description: "Improve code clarity through better naming, structure, and documentation. Use when code is hard to understand, poorly named, or needs better organization. Triggers: clarify, improve readability, better naming, make code clearer, simplify code."
---

# Clarify

Make code clearer and more understandable through better naming, structure, and documentation.

## When to Use

- Code is hard to follow or understand
- Variable/function names are unclear
- Logic is deeply nested or convoluted
- Code needs better inline documentation

## Clarity Improvements

### Naming
- Rename variables to describe WHAT they hold, not HOW they work
  - `d` → `daysSinceLastLogin`
  - `tmp` → `formattedAddress`
  - `data` → `userProfiles`
- Rename functions to describe WHAT they do
  - `process()` → `validateAndSaveOrder()`
  - `handle()` → `handleFormSubmission()`
  - `check()` → `isUserAuthorized()`
- Rename booleans with is/has/should/can prefix

### Structure
- Replace nested if/else with early returns
- Extract complex conditions into named booleans
  ```javascript
  // Before
  if (user.age >= 18 && user.verified && !user.banned) { ... }
  // After
  const isEligible = user.age >= 18 && user.verified && !user.banned;
  if (isEligible) { ... }
  ```
- Extract long functions into smaller, named functions
- Group related code together with blank lines

### Simplification
- Replace clever code with obvious code
- Use standard library functions over custom implementations
- Reduce function parameters (max 3, use objects for more)
- Remove unnecessary abstractions
- Flatten deep nesting

### Documentation
- Add JSDoc/docstrings to public functions
- Comment on WHY, not WHAT
- Add brief module-level comment explaining purpose
- Document non-obvious business rules
- Link to relevant specs or tickets

## Process
1. Read the code and identify confusion points
2. List unclear names, complex logic, missing context
3. Apply improvements systematically
4. Verify behavior unchanged after each change
5. Run tests to confirm no regressions
