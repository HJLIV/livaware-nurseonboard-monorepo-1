---
name: autoplan
description: "Automatically generate implementation plans from requirements or feature descriptions. Use when the user provides a feature request and needs a structured plan broken into tasks. Triggers: autoplan, plan this, create plan, implementation plan, break this down, task breakdown."
---

# Autoplan

Generate structured implementation plans from feature descriptions or requirements.

## When to Use

- User describes a feature and needs an implementation plan
- Breaking down a large task into smaller steps
- Creating a roadmap for a new project or feature
- User asks to "plan this" or "create a plan"

## Planning Process

### Step 1: Parse Requirements
- Extract functional requirements
- Identify non-functional requirements (performance, security)
- List assumptions that need validation
- Note ambiguities to resolve

### Step 2: Decompose into Tasks
- Break work into tasks that take 1-4 hours each
- Each task should produce a testable result
- Order tasks by dependency
- Identify tasks that can run in parallel

### Step 3: Structure the Plan

```markdown
# Implementation Plan: [Feature Name]

## Overview
[1-2 sentence summary]

## Prerequisites
- [Required setup or dependencies]

## Tasks

### Phase 1: Foundation
#### T001: [Task Name]
- **Depends on**: []
- **Description**: [What to do]
- **Files**: [Files to create/modify]
- **Acceptance**: [How to verify it's done]
- **Estimate**: [Time estimate]

#### T002: [Task Name]
- **Depends on**: [T001]
- **Description**: [What to do]
- **Files**: [Files to create/modify]
- **Acceptance**: [How to verify it's done]
- **Estimate**: [Time estimate]

### Phase 2: Core Features
...

### Phase 3: Polish & Testing
...

## Risks
- [Risk]: [Mitigation]

## Out of Scope
- [What this plan does NOT cover]
```

### Step 4: Review
- Verify all requirements are covered
- Check task dependencies are correct
- Ensure no circular dependencies
- Validate estimates are realistic

## Planning Principles
- Start with the smallest useful increment
- Front-load risky/uncertain work
- Keep phases deployable independently
- Include testing in every phase
- Leave polish and optimization for later phases
