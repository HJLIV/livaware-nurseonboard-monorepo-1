---
name: e2e-testing
description: "Design and implement end-to-end tests that verify complete user workflows. Use when testing user-facing features, multi-step flows, or integration between frontend and backend. Triggers: e2e test, end-to-end test, integration test, user flow test, Playwright test, Cypress test."
---

# End-to-End Testing

Design comprehensive E2E tests that verify real user workflows from start to finish.

## When to Use

- Testing complete user journeys (signup, checkout, etc.)
- Verifying frontend-backend integration
- Before major releases or deployments
- After implementing user-facing features

## Test Design Principles

### Focus on User Journeys
- Test the critical paths users actually take
- Prioritize: signup/login, core feature, checkout/payment
- Each test should represent a real user scenario

### Keep Tests Stable
- Use data-testid attributes for element selection
- Avoid selecting by CSS class or tag name
- Wait for elements explicitly rather than using fixed delays
- Clean up test data after each run

### Test Independence
- Each test should work independently
- Set up its own data (don't rely on other tests)
- Clean up after itself
- Use unique identifiers to avoid conflicts

## Test Plan Template

```markdown
## E2E Test Plan: [Feature]

### User Journey: [Journey Name]
1. [Step 1 — action + expected result]
2. [Step 2 — action + expected result]
3. [Step 3 — action + expected result]

### Preconditions
- [Required state or data]

### Assertions
- [What to verify at each step]

### Edge Cases
- [Error scenarios to test]
```

## Common Patterns

### Authentication Flow
1. Navigate to login page
2. Enter valid credentials
3. Verify redirect to dashboard
4. Verify session persists on refresh
5. Logout and verify redirect to login

### Form Submission
1. Navigate to form
2. Fill in valid data
3. Submit form
4. Verify success feedback
5. Verify data persisted correctly
6. Test with invalid data — verify error messages

### CRUD Operations
1. Create a new item
2. Verify it appears in the list
3. Edit the item
4. Verify changes are reflected
5. Delete the item
6. Verify it's removed from the list
