---
name: critique
description: "Provide constructive critique of code, design, or architecture with actionable feedback. Use when reviewing work for improvements, evaluating approaches, or providing feedback. Triggers: critique, review, feedback, evaluate, assess, code review."
---

# Critique

Provide thorough, constructive critique with actionable improvement suggestions.

## When to Use

- Reviewing code, design, or architecture for improvements
- Evaluating different approaches or solutions
- Providing feedback before finalization
- User asks for critique, review, or honest assessment

## Critique Framework

### 1. Understand Intent
- What is this trying to achieve?
- Who is the audience/user?
- What constraints exist?
- What's the current state (draft, MVP, production)?

### 2. Acknowledge Strengths
- What works well?
- What good decisions were made?
- What patterns are well-implemented?
- Keep this genuine — not empty praise

### 3. Identify Issues (by priority)

**Critical**: Prevents the goal from being achieved
- Bugs, security vulnerabilities, data loss risks
- Missing core functionality
- Fundamental architectural flaws

**Important**: Significantly impacts quality
- Performance problems
- Poor error handling
- Accessibility issues
- Maintainability concerns

**Suggestions**: Would improve quality
- Code style improvements
- Better naming
- Additional test coverage
- Documentation gaps

### 4. Provide Actionable Feedback
For each issue:
- **What**: Describe the problem specifically
- **Why**: Explain why it matters
- **How**: Suggest a concrete fix
- **Where**: Point to the specific location

### 5. Summary
- Overall assessment (what state is this in?)
- Top 3 priority items to address
- Effort estimate for key fixes

## Critique Output Format

```markdown
## Critique: [Subject]

### Strengths
- [Genuine positive observation]

### Critical Issues
- **[Issue]** ([location]): [Description]. Fix: [Specific suggestion].

### Important Improvements
- **[Issue]** ([location]): [Description]. Suggestion: [Approach].

### Minor Suggestions
- [Suggestion with rationale]

### Summary
[Overall assessment and top priorities]
```

## Guidelines
- Be specific, not vague ("line 42 has an SQL injection risk" not "security could be better")
- Critique the work, not the person
- Prioritize feedback — don't overwhelm with minor issues
- Offer solutions alongside problems
- Consider context (prototype vs. production)
