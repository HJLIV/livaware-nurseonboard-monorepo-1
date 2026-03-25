---
name: context-budget
description: "Manage context window usage efficiently when working with large codebases or complex tasks. Use when dealing with large files, many files, or complex multi-step tasks. Triggers: context management, large codebase, context window, token budget, efficient reading."
---

# Context Budget

Strategies for efficient context window management when working with large codebases.

## When to Use

- Working with large codebases (100+ files)
- Multi-step tasks requiring many file reads
- Tasks where you're approaching context limits
- Optimizing workflow efficiency

## Principles

### Read Strategically
- Start with entry points, not random files
- Read file structure before file contents
- Use grep to find relevant code instead of reading entire files
- Read only the sections you need (use offset/limit)

### Minimize Redundancy
- Don't re-read files you've already seen
- Take notes on key findings to avoid re-reading
- Summarize long files after reading them
- Reference line numbers instead of quoting large blocks

### Prioritize Information
- **Must know**: Files you need to edit
- **Should know**: Files that interact with edited files
- **Nice to know**: Background context

### Batch Operations
- Group related reads together
- Plan edits before making them
- Combine small changes into one edit
- Use search tools to locate specific code

## Strategies by Task Type

### Bug Fixing
1. Read the error message/stack trace
2. Go directly to the file/line mentioned
3. Read surrounding context (±20 lines)
4. Check related files only if needed

### Feature Implementation
1. Read the blueprint/spec
2. Identify files to create/modify
3. Read each file's relevant sections
4. Implement changes in order of dependencies

### Code Review
1. Read the diff, not entire files
2. Focus on changed sections
3. Check test coverage for changes
4. Review only related configuration changes

### Refactoring
1. Search for all usages of the target
2. Understand the current pattern
3. Plan all changes before starting
4. Execute changes systematically

## Anti-Patterns
- Reading entire large files when you need one function
- Re-reading files you already have in context
- Reading documentation files when code is self-explanatory
- Expanding search scope without exhausting focused searches
