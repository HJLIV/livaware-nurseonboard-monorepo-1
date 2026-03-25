---
name: prompt-optimizer
description: "Optimize prompts for clarity, specificity, and effectiveness. Use when crafting system prompts, refining LLM instructions, or improving prompt engineering. Triggers: prompt optimization, prompt engineering, improve prompt, system prompt, LLM instructions."
---

# Prompt Optimizer

Techniques for writing clear, effective prompts and instructions.

## When to Use

- Writing system prompts for LLM applications
- Refining prompts that produce inconsistent results
- Optimizing prompts for specific tasks
- Reviewing prompt quality

## Optimization Principles

### Clarity
- Use precise, unambiguous language
- Define terms that could be interpreted multiple ways
- Specify the exact output format expected
- Include examples of good and bad outputs

### Structure
- Start with role/context
- Follow with specific instructions
- Include constraints and boundaries
- End with output format specification

### Specificity
- Replace vague instructions with concrete ones
  - Bad: "Write a good summary"
  - Good: "Write a 2-3 sentence summary focusing on key findings and recommendations"
- Quantify when possible (length, count, format)
- Specify what to include AND what to exclude

### Examples (Few-Shot)
- Include 2-3 examples of desired input/output
- Show edge cases in examples
- Vary examples to show range of acceptable outputs
- Mark examples clearly as examples

## Prompt Structure Template

```
[Role]: You are a [specific role] that [specific capability].

[Context]: You are working with [context about the task/data].

[Instructions]:
1. [Step 1 — specific action]
2. [Step 2 — specific action]
3. [Step 3 — specific action]

[Constraints]:
- [What to avoid]
- [Limits on output]
- [Quality requirements]

[Output Format]:
[Exact format specification with example]
```

## Common Fixes

| Problem | Fix |
|---------|-----|
| Inconsistent output format | Add explicit format specification with example |
| Too verbose | Add word/sentence limits |
| Hallucinating facts | Add "only use provided information" constraint |
| Ignoring instructions | Move critical instructions to the beginning |
| Missing edge cases | Add "if X, then Y" conditional instructions |
