---
name: arrange
description: "Restructure and reorganize code, files, or project layout for clarity and maintainability. Use when reorganizing file structure, refactoring module boundaries, or improving project layout. Triggers: arrange, reorganize, restructure, file structure, project layout, refactor structure."
---

# Arrange

Reorganize code and project structure for clarity, maintainability, and scalability.

## When to Use

- File structure has become chaotic or hard to navigate
- Modules have unclear boundaries
- Need to restructure for new features or scale
- User asks to "organize", "arrange", or "restructure" the project

## Process

### Step 1: Map Current Structure
- Document current file/directory layout
- Identify module dependencies
- Find circular dependencies
- Note files that are too large or have mixed concerns

### Step 2: Identify Issues
- Files in wrong directories
- Mixed concerns (UI + business logic in one file)
- Orphaned files (unused imports, dead code)
- Missing index/barrel files for clean imports
- Inconsistent naming conventions

### Step 3: Plan New Structure
- Group by feature (preferred) or layer
- Define clear module boundaries
- Plan import paths and barrel exports
- Ensure no circular dependencies in new layout

### Step 4: Execute Migration
- Move files one module at a time
- Update all import paths after each move
- Run tests after each change
- Commit after each logical group of moves

## Common Patterns

### Feature-Based Structure
```
src/
  features/
    auth/
      components/
      hooks/
      services/
      types.ts
      index.ts
    dashboard/
      components/
      hooks/
      services/
      types.ts
      index.ts
  shared/
    components/
    hooks/
    utils/
    types/
```

### Layer-Based Structure
```
src/
  controllers/
  services/
  repositories/
  models/
  middleware/
  utils/
  config/
```

### Guidelines
- Keep related code close together
- Shared code in dedicated shared/ or common/ directory
- One component/class per file
- Index files for clean public APIs
- Co-locate tests with source files
