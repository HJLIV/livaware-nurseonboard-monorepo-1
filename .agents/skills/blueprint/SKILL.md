---
name: blueprint
description: "Create project blueprints and technical specifications before implementation. Use when starting a new project, feature, or major refactor. Triggers: blueprint, project plan, technical spec, system design, architecture plan, project scaffold."
---

# Blueprint

Create comprehensive project blueprints that define architecture, components, data flow, and implementation strategy before writing code.

## When to Use

- Starting a new project or major feature
- Planning a significant refactor or migration
- User asks for a "blueprint", "technical spec", or "project plan"
- Before any complex implementation work

## Process

### Step 1: Requirements Gathering
- Clarify the project's purpose and goals
- Identify target users and use cases
- Define success criteria and constraints
- List known technical requirements (language, framework, integrations)

### Step 2: Architecture Design
- Choose architectural pattern (monolith, microservices, serverless, etc.)
- Define major components and their responsibilities
- Map data flow between components
- Identify external dependencies and integrations

### Step 3: Component Specification
For each major component, document:
- **Purpose**: What it does
- **Interface**: How other components interact with it
- **Data**: What data it owns or transforms
- **Dependencies**: What it requires

### Step 4: Data Model
- Define entities and relationships
- Specify storage requirements (SQL, NoSQL, file system)
- Plan for data validation and constraints
- Consider migration strategy

### Step 5: API Design
- Define endpoints or interfaces
- Specify request/response formats
- Plan authentication and authorization
- Document error handling approach

### Step 6: Implementation Plan
- Break work into ordered phases
- Identify dependencies between phases
- Estimate complexity for each phase
- Define milestones and checkpoints

## Output Format

```markdown
# Blueprint: [Project Name]

## Overview
[1-2 paragraph summary]

## Architecture
[Diagram or description of system architecture]

## Components
### [Component Name]
- Purpose:
- Interface:
- Data:

## Data Model
[Entity definitions and relationships]

## API Design
[Endpoint specifications]

## Implementation Phases
1. [Phase]: [Description] - [Complexity]
2. ...

## Risks & Mitigations
- [Risk]: [Mitigation]

## Decision Log
- [Decision]: [Rationale]
```

## Key Principles

- **Start simple**: Begin with the minimal viable architecture
- **YAGNI**: Don't design for hypothetical future requirements
- **Separation of concerns**: Each component should have one clear job
- **Explicit interfaces**: Define how components communicate
- **Testability**: Design so components can be tested independently
