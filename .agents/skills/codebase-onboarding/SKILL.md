---
name: codebase-onboarding
description: "Rapidly understand and document an unfamiliar codebase. Use when joining a new project, exploring unknown code, or when the user asks to explain how a codebase works. Triggers: onboard to codebase, understand this project, explain codebase, code walkthrough, project overview."
---

# Codebase Onboarding

Systematically explore and document an unfamiliar codebase to build a comprehensive mental model.

## When to Use

- First time working with a codebase
- User asks "how does this project work?"
- Need to understand architecture before making changes
- Onboarding a new team member

## Process

### Step 1: High-Level Survey
- Read README, CONTRIBUTING, and docs/
- Check package.json, Cargo.toml, pyproject.toml, etc. for dependencies
- Identify the tech stack and framework
- Look at directory structure for architectural clues

### Step 2: Entry Points
- Find the main entry point (main.ts, app.py, index.js, etc.)
- Trace the startup sequence
- Identify configuration loading and initialization

### Step 3: Architecture Mapping
- Identify major modules/packages and their responsibilities
- Map dependencies between modules
- Find the data layer (database, APIs, file I/O)
- Locate the routing/controller layer
- Identify shared utilities and helpers

### Step 4: Data Flow
- Trace a typical request from entry to response
- Identify data models and schemas
- Map database tables/collections to code models
- Find data validation and transformation points

### Step 5: Key Patterns
- Identify design patterns in use (MVC, repository, event-driven, etc.)
- Note naming conventions and code style
- Find error handling patterns
- Locate logging and monitoring

### Step 6: Documentation
Create a concise onboarding document covering:
- Tech stack summary
- Architecture overview
- Key files and their purposes
- Common patterns and conventions
- How to run, test, and deploy

## Output Format

```markdown
# Codebase Overview: [Project Name]

## Tech Stack
- Language: [X]
- Framework: [X]
- Database: [X]
- Key Libraries: [X, Y, Z]

## Architecture
[Description of architectural pattern and major components]

## Key Directories
- `src/`: [Purpose]
- `lib/`: [Purpose]
- `tests/`: [Purpose]

## Entry Points
- Main: `[file]`
- Routes: `[file/directory]`
- Config: `[file]`

## Data Models
[Key entities and relationships]

## Common Patterns
[Patterns used throughout the codebase]

## Development Workflow
- Run: `[command]`
- Test: `[command]`
- Build: `[command]`
```
