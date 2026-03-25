---
name: autonomous-loops
description: "Patterns for autonomous agent workflows with feedback loops, checkpoints, and self-correction. Use when building multi-step automated processes that need monitoring and recovery. Triggers: autonomous workflow, feedback loop, self-correction, automated pipeline, agent loop."
---

# Autonomous Loops

Patterns for building reliable autonomous workflows with feedback loops and self-correction.

## When to Use

- Building multi-step automated processes
- Creating workflows that need to self-monitor and recover
- Implementing retry logic with intelligent adaptation
- Designing agent-like systems with checkpoint/resume

## Core Pattern

```
Plan → Execute → Verify → Adapt
  ↑                         ↓
  └─────── Feedback ────────┘
```

### 1. Plan Phase
- Define clear objectives and success criteria
- Break work into atomic, verifiable steps
- Identify dependencies between steps
- Set resource and time budgets

### 2. Execute Phase
- Execute one step at a time
- Capture output and side effects
- Log progress for debugging
- Respect resource limits

### 3. Verify Phase
- Check output against success criteria
- Run automated tests/validations
- Compare against expected outcomes
- Detect anomalies or regressions

### 4. Adapt Phase
- If verification passes: move to next step
- If verification fails: analyze the failure
- Try alternative approach (max 3 attempts per step)
- If stuck: escalate with context

## Safety Mechanisms

### Checkpoints
- Save state after each successful step
- Enable resume from last good state
- Include rollback capability

### Circuit Breakers
- Set maximum retry count per step
- Set overall workflow timeout
- Define failure thresholds for early termination
- Escalate to human when circuit breaks

### Guardrails
- Validate inputs before each step
- Scope-check: is this step within the original plan?
- Resource monitoring (time, API calls, tokens)
- Dry-run option for destructive operations

## Anti-Patterns to Avoid
- Infinite retry loops without backoff or limits
- Ignoring errors and continuing
- Making assumptions instead of verifying
- Expanding scope beyond the original plan
- Skipping verification to "save time"
