---
name: skill-creator
description: "Create new agent skills from scratch with proper structure, triggers, and instructions. Use when building custom skills, defining new agent capabilities, or packaging reusable workflows. Triggers: create skill, new skill, build skill, define capability, package workflow."
---

# Skill Creator

Build well-structured agent skills that are discoverable, useful, and maintainable.

## When to Use

- Creating a new skill from scratch
- Packaging a workflow as a reusable skill
- Improving an existing skill's structure
- User asks to "create a skill" or "teach you something"

## Skill Structure

### Required Files
```
.agents/skills/skill-name/
  SKILL.md           # Main skill file (required)
  reference/         # Optional reference materials
    examples.md
    templates.md
```

### SKILL.md Format
```markdown
---
name: skill-name
description: "What it does. When to use it. Trigger phrases."
---

# Skill Title

[Brief description of what this skill does]

## When to Use
- [Trigger condition 1]
- [Trigger condition 2]

## Process
### Step 1: [Phase Name]
- [Instructions]

### Step 2: [Phase Name]
- [Instructions]

## Output Format
[Expected output structure]
```

## Design Principles

### Discoverability
- Description must clearly state WHAT and WHEN
- Include trigger phrases that users would naturally say
- Be specific: "Create REST APIs" not "Help with code"

### Self-Containedness
- Don't assume external tools are available
- Include all necessary instructions in the skill
- Reference other skills by name when building on them
- Provide fallback instructions when dependencies are unavailable

### Actionability
- Every skill should produce a concrete output
- Include step-by-step processes
- Provide templates and examples
- Define clear "done" criteria

### Maintainability
- Keep SKILL.md under 500 lines
- Use reference files for large content
- Version significant changes
- Include examples of good and bad usage

## Quality Checklist
- [ ] Description includes clear triggers
- [ ] Process has numbered steps
- [ ] Output format is specified
- [ ] No external tool dependencies without fallbacks
- [ ] Under 500 lines
- [ ] Tested with realistic scenarios
