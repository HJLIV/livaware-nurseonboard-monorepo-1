---
name: backend-patterns
description: "Common backend architecture patterns and best practices. Use when designing server-side code, APIs, services, or data access layers. Triggers: backend architecture, service layer, repository pattern, middleware, server design."
---

# Backend Patterns

Reference guide for common backend architecture patterns and best practices.

## When to Use

- Designing a new backend service or API
- Structuring server-side code
- Choosing patterns for data access, error handling, or service organization
- Reviewing backend architecture

## Layered Architecture

```
Controller/Route → Service → Repository → Database
     ↓                ↓           ↓
  Validation     Business     Data Access
  Auth/Authz      Logic       Queries
  Serialization  Orchestration Caching
```

### Controller Layer
- Handle HTTP request/response
- Validate input format
- Call service layer
- Return appropriate status codes
- No business logic here

### Service Layer
- Business logic and rules
- Orchestrate between repositories
- Transaction management
- No direct database access
- No HTTP-specific concepts

### Repository Layer
- Database queries and mutations
- Data mapping (DB row → domain object)
- Query optimization
- Caching strategy
- No business logic

## Common Patterns

### Error Handling
- Use typed/custom error classes
- Centralized error handler middleware
- Consistent error response format
- Log errors with context (request ID, user, operation)
- Never expose internal errors to clients

### Middleware Pipeline
```
Request → Auth → Rate Limit → Validate → Route → Response
                                           ↓
                                      Error Handler
```

### Configuration Management
- Environment variables for deployment-specific values
- Config validation at startup (fail fast)
- Typed configuration objects
- Sensible defaults with override capability

### Database Connection
- Connection pooling (don't create per-request)
- Retry logic with exponential backoff
- Health checks on startup
- Graceful shutdown (drain connections)

### Logging
- Structured logging (JSON format)
- Request ID correlation
- Log levels: ERROR, WARN, INFO, DEBUG
- Sensitive data redaction
- Performance metrics

### Caching
- Cache-aside pattern for reads
- Cache invalidation on writes
- TTL-based expiration
- Consider cache stampede prevention
