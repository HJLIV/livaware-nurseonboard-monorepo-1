---
name: architecture-decision-records
description: "Create and manage Architecture Decision Records (ADRs) to document important technical decisions. Use when making significant architectural choices, evaluating alternatives, or when the user asks to document a technical decision. Triggers: ADR, architecture decision, document decision, technical decision record."
---

# Architecture Decision Records

Document significant architectural and technical decisions using a structured ADR format.

## When to Use

- Making a significant technical choice (database, framework, pattern)
- Evaluating alternatives for a component or approach
- User asks to "document a decision" or "create an ADR"
- Revisiting a past decision that needs updating

## ADR Format

```markdown
# ADR-[NNN]: [Title]

## Status
[Proposed | Accepted | Deprecated | Superseded by ADR-XXX]

## Context
[What is the issue? What forces are at play?]

## Decision
[What was decided and why]

## Alternatives Considered
### [Alternative 1]
- Pros: [...]
- Cons: [...]

### [Alternative 2]
- Pros: [...]
- Cons: [...]

## Consequences
### Positive
- [Benefit 1]

### Negative
- [Tradeoff 1]

### Neutral
- [Side effect 1]

## References
- [Links to relevant docs, discussions, or prior ADRs]
```

## Process

1. **Identify the decision**: What architectural choice needs to be made?
2. **Document context**: What problem are we solving? What constraints exist?
3. **List alternatives**: At least 2-3 viable options with pros/cons
4. **Record the decision**: Which option was chosen and the rationale
5. **Note consequences**: What are the tradeoffs?
6. **Store the ADR**: Save to `docs/adr/` directory with sequential numbering

## File Naming

- `docs/adr/0001-use-postgresql-for-persistence.md`
- `docs/adr/0002-adopt-event-driven-architecture.md`
- Use lowercase with hyphens, prefix with zero-padded number

## Key Principles

- ADRs are immutable once accepted — supersede rather than edit
- Keep context focused on the specific decision
- Include enough detail for someone unfamiliar with the discussion
- Link to related ADRs when decisions interact
