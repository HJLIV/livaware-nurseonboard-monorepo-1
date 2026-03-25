---
name: distill
description: "Condense and simplify complex code, documentation, or information into its essential elements. Use when code is over-engineered, docs are verbose, or information needs to be more concise. Triggers: distill, simplify, condense, reduce complexity, essential only, too verbose."
---

# Distill

Reduce complexity by extracting the essential elements and removing the unnecessary.

## When to Use

- Code is over-engineered or overly abstract
- Documentation is too verbose to be useful
- Need to simplify a complex system or explanation
- User asks to "simplify", "distill", or "make it simpler"

## Distillation Process

### For Code
1. Identify the core purpose of the code
2. Remove unused features, parameters, and branches
3. Collapse unnecessary abstraction layers
4. Inline small functions called only once
5. Replace complex patterns with simpler alternatives
6. Remove speculative generality (YAGNI)

### For Documentation
1. Identify the key message or purpose
2. Remove redundant explanations
3. Use tables instead of paragraphs for structured data
4. Cut filler words and phrases
5. Use examples instead of verbose descriptions
6. Target: convey the same information in 50% fewer words

### For Architecture
1. Identify which components are essential
2. Merge components with overlapping responsibilities
3. Remove middleware/layers that just pass through
4. Simplify data flow (reduce transformations)
5. Question every abstraction: does this earn its complexity?

## Rules of Thumb
- If you can't explain what a function does in one sentence, it does too much
- If removing a layer doesn't change behavior, remove it
- If a configuration has only one valid value, hardcode it
- If an abstraction has only one implementation, inline it
- Prefer boring, obvious code over clever, compact code
