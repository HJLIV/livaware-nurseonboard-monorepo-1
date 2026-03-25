---
name: onboard
description: "Create onboarding experiences for new users or contributors. Use when building first-run experiences, welcome flows, or contributor guides. Triggers: onboard, onboarding flow, welcome experience, first-run, getting started, new user guide."
---

# Onboard

Design and implement effective onboarding experiences for users or contributors.

## When to Use

- Building a first-run experience for new users
- Creating contributor/developer onboarding
- Improving initial setup or getting-started flow
- User asks for onboarding help

## User Onboarding Principles

### Progressive Disclosure
- Show only what's needed at each step
- Don't overwhelm with all features at once
- Let users discover advanced features naturally
- Provide clear "next step" at each stage

### Onboarding Flow Design
1. **Welcome**: Brief explanation of what the product does
2. **Setup**: Minimum required configuration
3. **First Success**: Guide to completing one meaningful action
4. **Exploration**: Suggest next features to try

### Best Practices
- Keep initial setup under 3 steps
- Pre-fill sensible defaults
- Show progress (step 2 of 4)
- Allow skipping non-essential steps
- Celebrate first achievements

## Developer Onboarding

### Essential Documentation
- Prerequisites (language, tools, accounts)
- Clone and setup steps (one command ideally)
- How to run locally
- How to run tests
- How to submit changes

### README Template
```markdown
# Project Name
[One-sentence description]

## Quick Start
\`\`\`bash
git clone [repo]
cd [project]
[install command]
[run command]
\`\`\`

## Development
- Run tests: \`[command]\`
- Build: \`[command]\`
- Lint: \`[command]\`

## Architecture
[Brief overview with link to detailed docs]

## Contributing
[Link to CONTRIBUTING.md]
```
