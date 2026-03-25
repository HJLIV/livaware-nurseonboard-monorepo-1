---
name: normalize
description: "Normalize inconsistent code patterns, data structures, or conventions across a codebase. Use when different parts of the code use different patterns for the same thing. Triggers: normalize, standardize, make consistent, unify patterns, inconsistent code."
---

# Normalize

Make inconsistent code, patterns, and conventions uniform across a codebase.

## When to Use

- Different parts of the codebase use different patterns for the same thing
- Naming conventions are inconsistent
- Data structures vary between similar entities
- Error handling approaches differ across modules

## Normalization Process

### Step 1: Survey Patterns
- Identify all variations of a pattern in use
- Count occurrences of each variation
- Determine which variation is best (most common, most idiomatic, or most correct)

### Step 2: Define the Standard
- Choose one pattern as the canonical approach
- Document the standard with examples
- Note any exceptions and why they're allowed

### Step 3: Apply Consistently
- Update all occurrences to match the standard
- Use search-and-replace for mechanical changes
- Review each change for correctness
- Run tests after each batch of changes

### Step 4: Enforce
- Add linting rules where possible
- Update coding standards documentation
- Configure formatters to enforce style

## Common Normalizations

### Naming
- camelCase vs snake_case vs kebab-case → pick one per context
- Verb prefix consistency (get/fetch/retrieve → pick one)
- Plural vs singular for collections

### Error Handling
- Callbacks vs promises vs async/await → pick one
- Error types and messages → consistent format
- Error response structure → single standard

### Data Structures
- API response formats → consistent envelope
- Date formats → ISO 8601 everywhere
- ID formats → consistent type (string/number/UUID)

### Import Organization
- Consistent import ordering
- Absolute vs relative imports
- Barrel file usage
