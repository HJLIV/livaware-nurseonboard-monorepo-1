---
name: extract
description: "Extract reusable components, functions, modules, or patterns from existing code. Use when identifying code that should be shared, creating libraries from application code, or refactoring for reuse. Triggers: extract, refactor, extract component, create module, make reusable, DRY."
---

# Extract

Identify and extract reusable code into well-defined components, functions, or modules.

## When to Use

- Duplicated code found across multiple files
- A function or component has grown too large
- Code should be shared across features
- Creating a library from application code

## Extraction Process

### Step 1: Identify Candidates
- Look for duplicated logic (3+ occurrences)
- Find functions over 40 lines
- Identify components with mixed concerns
- Spot hardcoded values that should be configurable

### Step 2: Define Interface
- What inputs does the extracted code need?
- What does it return/produce?
- What are the edge cases?
- Should it be configurable or opinionated?

### Step 3: Extract
- Create the new function/component/module
- Define a clean, minimal interface
- Move implementation into the new location
- Replace original code with calls to the extracted code

### Step 4: Verify
- All original tests still pass
- Add tests for the extracted code
- Check all call sites work correctly
- Verify no circular dependencies introduced

## Extraction Patterns

### Function Extraction
- Extract when logic is duplicated or complex
- Keep extracted functions pure when possible
- Limit to 3-4 parameters (use objects for more)

### Component Extraction
- Extract when UI patterns repeat
- Make components configurable via props
- Keep components focused on one visual concern

### Hook/Composable Extraction
- Extract when stateful logic is shared
- Encapsulate related state and effects together
- Return a clean, minimal API

### Module Extraction
- Extract when a group of related functions should be isolated
- Define clear public API via index/barrel file
- Hide internal implementation details

## Anti-Patterns
- Extracting too early (premature abstraction)
- Extracting with too many parameters (sign of poor boundaries)
- Forced reuse of code that's only superficially similar
- Creating abstractions for one use case
