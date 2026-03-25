---
name: tdd-workflow
description: "Follow Test-Driven Development workflow: write failing tests first, then implement code to pass them. Use when the user wants TDD, asks for tests before code, or when building critical logic that needs comprehensive test coverage. Triggers: TDD, test-driven, write tests first, red-green-refactor."
---

# TDD Workflow

Follow the Red-Green-Refactor cycle to build reliable, well-tested software.

## When to Use

- User requests TDD approach
- Building critical business logic
- Implementing algorithms or data processing
- Working on code that needs high reliability

## The Cycle

### 1. Red: Write a Failing Test
- Write the smallest test that describes desired behavior
- Run it — confirm it fails for the right reason
- The test should fail because the feature doesn't exist yet, not because of a syntax error

### 2. Green: Make It Pass
- Write the minimum code to make the test pass
- Don't optimize or generalize yet
- It's okay if the implementation is naive

### 3. Refactor: Clean Up
- Improve the code without changing behavior
- Remove duplication
- Improve naming and structure
- Run tests after each change — they should still pass

### 4. Repeat
- Add the next test for the next behavior
- Follow the same cycle

## Test Writing Guidelines

### Good Tests Are:
- **Fast**: Each test runs in milliseconds
- **Independent**: No test depends on another
- **Deterministic**: Same result every time
- **Descriptive**: Test name describes the behavior

### Test Structure (Arrange-Act-Assert)
```
// Arrange: Set up test data and conditions
// Act: Execute the behavior under test
// Assert: Verify the expected outcome
```

### What to Test
- Happy path (expected inputs produce expected outputs)
- Edge cases (empty inputs, boundaries, nulls)
- Error cases (invalid inputs, failure modes)
- Business rules and invariants

### What NOT to Test
- Framework internals
- Third-party library behavior
- Simple getters/setters with no logic
- Implementation details (test behavior, not structure)

## Process for a Feature

1. List the behaviors the feature needs
2. Order them from simplest to most complex
3. Write a test for the simplest behavior
4. Red-Green-Refactor
5. Move to the next behavior
6. After all behaviors: review test coverage and edge cases
