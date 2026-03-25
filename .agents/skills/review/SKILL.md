---
name: review
description: "Conduct thorough code reviews with structured feedback and actionable suggestions. Use when reviewing pull requests, evaluating code changes, or providing feedback on implementations. Triggers: code review, PR review, review changes, review my code, check this implementation."
---

# Review

Structured code review process for providing clear, actionable feedback.

## When to Use

- Reviewing a pull request or code changes
- Evaluating an implementation approach
- Pre-merge quality check
- User asks to "review my code" or "check this"

## Review Process

### Phase 1: Context
- Understand what the change is trying to accomplish
- Read the PR description, linked issues, or user's explanation
- Note the scope: is this a bug fix, feature, refactor, or optimization?

### Phase 2: Architecture Review
- Does the approach make sense for the problem?
- Does it fit the existing architecture?
- Are there simpler alternatives?
- Will this be maintainable?

### Phase 3: Correctness
- Does it do what it claims to do?
- Are edge cases handled?
- Are there race conditions or concurrency issues?
- Is error handling comprehensive?

### Phase 4: Quality
- Code readability and naming
- Function/method length and complexity
- DRY violations or over-abstraction
- Test coverage and quality
- Performance implications

### Phase 5: Security
- Input validation
- Authentication/authorization
- Data exposure risks
- Injection vulnerabilities

## Feedback Format

```markdown
## Code Review: [Subject]

### Summary
[1-2 sentence assessment]

### Must Fix (Blocking)
- **[File:Line]**: [Issue description]. Suggestion: [Fix].

### Should Fix (Non-blocking)
- **[File:Line]**: [Issue description]. Suggestion: [Fix].

### Nits (Optional)
- **[File:Line]**: [Minor suggestion]

### Questions
- [Clarification needed about design decisions]

### Positives
- [What was done well]

### Verdict
[Approve / Request Changes / Comment Only]
```

## Review Guidelines
- Be specific — reference exact files and lines
- Explain WHY something is a problem
- Suggest solutions, not just problems
- Distinguish blocking vs non-blocking feedback
- Acknowledge good patterns and improvements
- Ask questions instead of assuming intent
