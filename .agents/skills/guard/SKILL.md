---
name: guard
description: "Set up automated guardrails, linting rules, pre-commit hooks, and CI checks to prevent common mistakes. Use when establishing code quality gates, adding pre-commit hooks, or setting up automated checks. Triggers: guard, guardrails, pre-commit hooks, CI checks, quality gates, lint rules."
---

# Guard

Set up automated guardrails to prevent common mistakes and enforce quality standards.

## When to Use

- Setting up a new project's quality infrastructure
- Adding pre-commit hooks or CI checks
- Enforcing coding standards automatically
- Preventing common deployment mistakes

## Guardrail Types

### Pre-Commit Hooks
- Lint staged files
- Format code automatically
- Run fast unit tests
- Check for secrets/credentials
- Validate commit message format

### CI Pipeline Checks
- All tests pass
- Linting passes
- Type checking passes
- Security audit clean
- Build succeeds
- Coverage threshold met

### Runtime Guards
- Input validation at API boundaries
- Feature flags for risky changes
- Health checks for services
- Rate limiting for abuse prevention
- Circuit breakers for failing dependencies

## Setup Patterns

### JavaScript/TypeScript
```json
{
  "scripts": {
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "precommit": "lint-staged"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css}": ["prettier --write"]
  }
}
```

### Python
```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
  - repo: https://github.com/psf/black
    hooks:
      - id: black
  - repo: https://github.com/pycqa/flake8
    hooks:
      - id: flake8
```

## Guard Implementation Priority
1. Formatting (zero effort after setup)
2. Linting (catches common mistakes)
3. Type checking (catches type errors)
4. Tests (catches logic errors)
5. Security scanning (catches vulnerabilities)
6. Coverage thresholds (maintains test quality)
