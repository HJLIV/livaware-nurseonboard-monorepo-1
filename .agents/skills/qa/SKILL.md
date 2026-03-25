---
name: qa
description: "Comprehensive quality assurance testing with structured test plans and defect tracking. Use when performing thorough testing of features, validating requirements, or creating test plans. Triggers: QA, quality assurance, test plan, manual testing, acceptance testing, validate feature."
---

# QA

Systematic quality assurance process for validating features and finding defects.

## When to Use

- Testing a completed feature before release
- Validating requirements are met
- Creating comprehensive test plans
- User asks for QA, testing, or validation

## QA Process

### Phase 1: Understand Requirements
- Read the feature spec or user story
- Identify acceptance criteria
- List expected behaviors and edge cases
- Clarify ambiguous requirements

### Phase 2: Create Test Plan

```markdown
## Test Plan: [Feature Name]

### Scope
- [What's being tested]
- [What's out of scope]

### Test Cases

#### TC-001: [Scenario Name]
- **Preconditions**: [Required state]
- **Steps**:
  1. [Action]
  2. [Action]
- **Expected Result**: [What should happen]
- **Priority**: [High/Medium/Low]

#### TC-002: [Scenario Name]
...
```

### Phase 3: Execute Tests
- Follow test cases systematically
- Record pass/fail for each
- Capture screenshots for failures
- Note unexpected behaviors (even if not failures)

### Phase 4: Report

```markdown
## QA Report: [Feature Name]

### Summary
- Total test cases: [N]
- Passed: [N]
- Failed: [N]
- Blocked: [N]

### Defects Found
#### DEF-001: [Title]
- **Severity**: [Critical/High/Medium/Low]
- **Steps to Reproduce**: [Steps]
- **Expected**: [What should happen]
- **Actual**: [What actually happens]

### Recommendations
- [Ship / Fix and retest / Block release]
```

## Test Categories

### Functional Testing
- Happy path (normal usage)
- Edge cases (boundaries, limits)
- Error handling (invalid input, failures)
- State transitions (login/logout, save/load)

### Cross-Cutting Concerns
- Different screen sizes
- Different browsers (if web)
- With slow network (if applicable)
- With large data volumes
- Keyboard navigation
- Screen reader compatibility
