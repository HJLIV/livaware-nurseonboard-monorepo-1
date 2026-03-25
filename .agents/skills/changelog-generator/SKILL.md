---
name: changelog-generator
description: "Generate changelogs from git history, commits, and pull requests. Use when creating release notes, summarizing changes, or maintaining a changelog file. Triggers: changelog, release notes, what changed, summarize commits, version history."
---

# Changelog Generator

Generate clear, user-friendly changelogs from git history.

## When to Use

- Preparing a release and need release notes
- Maintaining a CHANGELOG.md file
- Summarizing recent changes for stakeholders
- User asks "what changed" or "generate changelog"

## Process

### Step 1: Gather Changes
```bash
# Get commits since last tag
git log --oneline $(git describe --tags --abbrev=0)..HEAD

# Get commits between two dates
git log --oneline --since="2024-01-01" --until="2024-02-01"

# Get commits with details
git log --pretty=format:"%h %s (%an)" $(git describe --tags --abbrev=0)..HEAD
```

### Step 2: Categorize Changes
Group commits into categories:
- **Added**: New features
- **Changed**: Changes to existing functionality
- **Fixed**: Bug fixes
- **Removed**: Removed features
- **Security**: Security-related changes
- **Performance**: Performance improvements
- **Documentation**: Documentation updates

### Step 3: Write Changelog

```markdown
# Changelog

## [1.2.0] - 2024-03-15

### Added
- User profile page with avatar upload
- Email notification preferences

### Changed
- Updated dashboard layout for better mobile experience
- Improved search performance with indexing

### Fixed
- Fixed login redirect loop on expired sessions
- Fixed currency formatting for non-USD currencies

### Security
- Updated dependencies to patch CVE-2024-XXXXX
```

## Guidelines
- Write for users, not developers
- Describe the impact, not the implementation
- Use present tense ("Add feature" not "Added feature")
- Group related changes together
- Include breaking changes prominently
- Link to issues/PRs when relevant
- Follow [Keep a Changelog](https://keepachangelog.com/) format
