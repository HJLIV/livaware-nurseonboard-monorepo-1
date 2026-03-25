---
name: harden
description: "Harden code and infrastructure against failures, attacks, and edge cases. Use when improving resilience, adding defensive coding, or preparing for hostile environments. Triggers: harden, defensive coding, resilience, robustness, fault tolerance, hardening."
---

# Harden

Strengthen code and systems against failures, attacks, and unexpected conditions.

## When to Use

- Preparing code for production/hostile environments
- After security review findings
- Improving system resilience
- Adding defensive coding practices

## Hardening Checklist

### Input Hardening
- Validate all external inputs at system boundaries
- Set maximum lengths for string inputs
- Whitelist allowed values where possible
- Sanitize data before use in queries, commands, or output
- Reject malformed data early with clear error messages

### Error Resilience
- Wrap external service calls with timeouts
- Implement retry with exponential backoff
- Add circuit breakers for failing dependencies
- Provide fallback behavior for non-critical features
- Never expose stack traces or internal errors to users

### Resource Protection
- Set rate limits on public endpoints
- Limit request body sizes
- Set connection pool limits
- Implement request timeouts
- Monitor resource usage (memory, CPU, disk)

### Data Integrity
- Use database transactions for multi-step operations
- Implement idempotency for retry-safe operations
- Validate data consistency on write
- Add checksums for data transfer
- Handle partial failures in batch operations

### Configuration Safety
- Validate all configuration at startup
- Fail fast on missing required configuration
- Use secure defaults
- Never log sensitive configuration values
- Environment-specific overrides with validation

### Dependency Safety
- Pin dependency versions
- Audit dependencies for vulnerabilities
- Minimize dependency count
- Have fallbacks for critical external services
- Monitor dependency health

## Implementation Priority
1. Input validation (highest attack surface)
2. Error handling (prevents cascading failures)
3. Rate limiting (prevents abuse)
4. Timeout/retry (prevents hanging)
5. Monitoring (enables detection)
