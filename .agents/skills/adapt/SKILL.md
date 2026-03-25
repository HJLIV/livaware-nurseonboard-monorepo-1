---
name: adapt
description: "Adapt code to work across different environments, platforms, or configurations. Use when making code portable, supporting multiple environments, or handling platform differences. Triggers: adapt, cross-platform, environment compatibility, portability, platform support."
---

# Adapt

Make code work across different environments, platforms, and configurations.

## When to Use

- Making code work in a new environment
- Adding cross-platform support
- Handling environment-specific differences
- Making code more portable

## Adaptation Process

### Step 1: Analyze Current Dependencies
- Identify platform-specific code
- List environment assumptions (OS, runtime, services)
- Find hardcoded paths, URLs, or configurations
- Check for platform-specific APIs

### Step 2: Abstract Platform Differences
- Create adapter interfaces for platform-specific operations
- Use environment variables for configuration
- Use path utilities instead of hardcoded separators
- Abstract file system, network, and OS operations

### Step 3: Implement Alternatives
- Provide fallbacks for unavailable features
- Use feature detection over platform detection
- Create environment-specific configuration files
- Document minimum requirements per platform

### Step 4: Verify
- Test in each target environment
- Verify graceful degradation for optional features
- Check configuration for all environments
- Validate documentation completeness

## Common Adaptations

### Environment Variables
- Use `.env` files with a loader (dotenv)
- Provide `.env.example` with all required variables
- Validate required variables at startup
- Document each variable's purpose

### Platform-Specific Code
```javascript
const isWindows = process.platform === 'win32';
const pathSep = path.sep; // Use path module, not hardcoded '/'
```

### Service Abstraction
- Abstract database connections behind interfaces
- Support multiple storage backends
- Use dependency injection for swappable services
- Provide in-memory implementations for testing
