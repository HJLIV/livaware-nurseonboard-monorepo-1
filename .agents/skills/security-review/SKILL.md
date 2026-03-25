---
name: security-review
description: "Perform security reviews of code, configurations, and architecture. Use when auditing code for vulnerabilities, reviewing auth implementations, checking for common security issues, or before deploying to production. Triggers: security review, security audit, vulnerability check, pen test review, OWASP check."
---

# Security Review

Systematic security review of code, configurations, and architecture to identify vulnerabilities.

## When to Use

- Before deploying to production
- After implementing authentication/authorization
- When handling sensitive data (PII, credentials, payments)
- User asks for a security review or audit
- Reviewing third-party integrations

## Review Checklist

### Authentication & Authorization
- [ ] Passwords hashed with bcrypt/scrypt/argon2 (not MD5/SHA)
- [ ] Session tokens are cryptographically random
- [ ] JWT secrets are strong and not hardcoded
- [ ] Rate limiting on login endpoints
- [ ] RBAC/ABAC properly enforced on all endpoints
- [ ] No authorization bypass through parameter manipulation

### Input Validation
- [ ] All user input validated and sanitized
- [ ] SQL queries use parameterized statements (no string concatenation)
- [ ] XSS prevention (output encoding, CSP headers)
- [ ] File upload validation (type, size, content)
- [ ] Path traversal prevention
- [ ] Command injection prevention

### Data Protection
- [ ] Sensitive data encrypted at rest and in transit
- [ ] No secrets in source code or version control
- [ ] PII handled according to requirements (GDPR, etc.)
- [ ] Proper data sanitization in logs
- [ ] Secure cookie flags (HttpOnly, Secure, SameSite)

### API Security
- [ ] CORS properly configured (not wildcard in production)
- [ ] Rate limiting on all public endpoints
- [ ] Request size limits
- [ ] No sensitive data in URLs or query parameters
- [ ] API versioning strategy
- [ ] Error messages don't leak internal details

### Infrastructure
- [ ] HTTPS enforced
- [ ] Security headers set (HSTS, X-Content-Type-Options, etc.)
- [ ] Dependencies checked for known vulnerabilities
- [ ] Environment variables used for configuration
- [ ] Least-privilege access for services

### Common Vulnerabilities (OWASP Top 10)
1. Broken Access Control
2. Cryptographic Failures
3. Injection
4. Insecure Design
5. Security Misconfiguration
6. Vulnerable Components
7. Authentication Failures
8. Data Integrity Failures
9. Logging/Monitoring Failures
10. Server-Side Request Forgery

## Output Format

```markdown
## Security Review: [Component/Feature]

### Critical Issues
- [Issue]: [Location] - [Impact] - [Fix]

### High Risk
- [Issue]: [Location] - [Impact] - [Fix]

### Medium Risk
- [Issue]: [Location] - [Impact] - [Fix]

### Low Risk / Informational
- [Issue]: [Location] - [Impact] - [Fix]

### Passed Checks
- [Check that passed]

### Recommendations
- [Proactive improvement]
```
