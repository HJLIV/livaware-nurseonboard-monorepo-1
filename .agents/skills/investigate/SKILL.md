---
name: investigate
description: "Systematically investigate bugs, errors, and unexpected behavior through structured debugging. Use when tracking down the root cause of issues, analyzing error logs, or debugging complex problems. Triggers: investigate, debug, root cause, trace error, why is this broken, find the bug."
---

# Investigate

Structured approach to debugging and root cause analysis.

## When to Use

- Something is broken and the cause is unclear
- Tracking down intermittent or hard-to-reproduce bugs
- Analyzing error logs or stack traces
- User asks to "investigate", "debug", or "find the bug"

## Investigation Process

### Phase 1: Observe
- Reproduce the problem reliably
- Gather all symptoms (error messages, logs, behavior)
- Note when it started and what changed
- Identify affected scope (all users, some users, specific conditions)

### Phase 2: Hypothesize
- List possible causes ranked by likelihood
- Consider recent changes (code, config, dependencies)
- Check for common issues (permissions, network, data)
- Rule out environmental factors

### Phase 3: Test
For each hypothesis, starting with most likely:
1. Define a test that would confirm or eliminate it
2. Execute the test
3. Record the result
4. Move to next hypothesis if not confirmed

### Phase 4: Root Cause
- Identify the actual root cause (not just the symptom)
- Ask "why" repeatedly until you reach the fundamental issue
- Distinguish between the trigger and the underlying vulnerability

### Phase 5: Fix & Verify
- Implement the fix
- Verify the original issue is resolved
- Check for side effects
- Add test to prevent regression
- Document the finding

## Debugging Techniques

### Binary Search
- Narrow down the problem by halving the search space
- Comment out half the code, check if issue persists
- Use git bisect for regression bugs

### Trace Backwards
- Start from the error and trace backwards
- Follow the data from where it's wrong to where it's created
- Check each transformation step

### Compare Working vs Broken
- Find a working case and a broken case
- Identify what's different between them
- The difference often points to the cause

### Log Analysis
- Search for ERROR/WARN first
- Look at timestamps around the failure
- Correlate events across services
- Check for patterns in failures

## Report Format

```markdown
## Investigation: [Issue Title]

### Symptoms
- [Observable behavior]

### Root Cause
[What's actually wrong and why]

### Fix
[What was changed]

### Prevention
[How to prevent recurrence]
```
