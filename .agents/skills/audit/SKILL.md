---
name: audit
description: "Perform comprehensive code audits for quality, consistency, and best practices. Use when reviewing code quality, checking for anti-patterns, or assessing technical debt. Triggers: code audit, quality check, anti-pattern detection, technical debt assessment, code health."
---

# Audit

Systematically evaluate code quality, consistency, and adherence to best practices.

## When to Use

- Assessing overall code quality of a project or module
- Checking for anti-patterns and technical debt
- Before major refactoring to identify problem areas
- Periodic code health checks

## Audit Process

### Step 1: Scope
- Define what's being audited (file, module, entire project)
- Identify the tech stack and expected conventions
- Review existing linting/formatting configuration

### Step 2: Structural Analysis
- File organization and naming conventions
- Module boundaries and dependencies
- Circular dependency detection
- Dead code identification
- Code duplication

### Step 3: Quality Checks
- Function complexity (cyclomatic complexity)
- Function length and parameter count
- Error handling completeness
- Type safety and null handling
- Test coverage gaps

### Step 4: Pattern Analysis
- Consistency of patterns across codebase
- Anti-patterns: god objects, deep nesting, magic numbers
- DRY violations
- SOLID principle violations
- Framework misuse

### Step 5: Security Scan
- Hardcoded secrets or credentials
- SQL injection vectors
- XSS vulnerabilities
- Insecure dependencies
- Missing input validation

### Step 6: Report

```markdown
## Audit Report: [Scope]

### Summary
- Files audited: [N]
- Issues found: [Critical: N, High: N, Medium: N, Low: N]

### Critical Issues
- [Issue]: [File:Line] - [Description] - [Recommended Fix]

### Patterns Observed
- [Pattern]: [Good/Bad] - [Details]

### Technical Debt
- [Area]: [Severity] - [Effort to fix] - [Impact if unfixed]

### Recommendations
1. [Priority action]
2. [Next action]
```

## Severity Guide
- **Critical**: Security vulnerability or data loss risk
- **High**: Bug-prone code or significant maintainability issue
- **Medium**: Code smell or minor anti-pattern
- **Low**: Style inconsistency or minor improvement opportunity
