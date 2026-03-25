---
name: coding-standards
description: "Establish and enforce coding standards and conventions for a project. Use when setting up linting, formatting, naming conventions, or code quality rules. Triggers: coding standards, code style, linting, formatting, naming conventions, code quality."
---

# Coding Standards

Establish consistent coding standards for maintainable, readable code.

## When to Use

- Setting up a new project's conventions
- Onboarding contributors to existing standards
- Reviewing code for consistency
- Configuring linters and formatters

## Universal Principles

### Naming
- **Variables/functions**: Describe what, not how (`userEmail` not `str1`)
- **Booleans**: Use is/has/should prefix (`isActive`, `hasPermission`)
- **Functions**: Start with verb (`getUser`, `calculateTotal`, `validateInput`)
- **Constants**: UPPER_SNAKE_CASE for true constants
- **Classes/Types**: PascalCase
- **Files**: Match the primary export's convention

### Functions
- Single responsibility
- Max 30-40 lines (extract if longer)
- Max 3-4 parameters (use objects for more)
- Pure functions when possible
- Early returns to reduce nesting

### Error Handling
- Handle errors explicitly — no silent catches
- Use typed errors when the language supports it
- Log errors with context
- Fail fast on invalid state

### Comments
- Explain WHY, not WHAT
- Don't comment obvious code
- Keep comments up to date with code
- Use JSDoc/docstrings for public APIs

### Code Organization
- Group by feature, not by type
- Keep related code close together
- Minimize circular dependencies
- Clear module boundaries

## Language-Specific

### TypeScript/JavaScript
- Use TypeScript for any non-trivial project
- Prefer `const` over `let`, never use `var`
- Use strict mode and strict TypeScript config
- Prefer async/await over raw promises
- Use optional chaining and nullish coalescing

### Python
- Follow PEP 8
- Use type hints
- Use f-strings for formatting
- Prefer list/dict comprehensions for simple transforms
- Use dataclasses or Pydantic for data structures

### Go
- Follow standard Go conventions
- Use `gofmt` (non-negotiable)
- Handle errors explicitly
- Prefer composition over inheritance
- Use interfaces for testability

## Tooling Setup
- Linter: ESLint, Pylint, golangci-lint
- Formatter: Prettier, Black, gofmt
- Pre-commit hooks for automated checks
- CI/CD integration for enforcement
