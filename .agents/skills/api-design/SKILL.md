---
name: api-design
description: "Design RESTful and GraphQL APIs with consistent conventions. Use when creating new APIs, reviewing API designs, or establishing API standards. Triggers: API design, REST API, GraphQL schema, endpoint design, API conventions."
---

# API Design

Design consistent, well-documented APIs following industry best practices.

## When to Use

- Designing new API endpoints
- Reviewing existing API structure
- Establishing API conventions for a project
- Planning API versioning or migration

## REST API Conventions

### URL Structure
- Use nouns, not verbs: `/users` not `/getUsers`
- Use plural nouns: `/users` not `/user`
- Nest for relationships: `/users/{id}/orders`
- Keep URLs shallow (max 3 levels deep)
- Use kebab-case: `/user-profiles` not `/userProfiles`

### HTTP Methods
| Method | Purpose | Idempotent | Response |
|--------|---------|------------|----------|
| GET | Read resource(s) | Yes | 200 with body |
| POST | Create resource | No | 201 with body + Location |
| PUT | Replace resource | Yes | 200 with body |
| PATCH | Partial update | No | 200 with body |
| DELETE | Remove resource | Yes | 204 no body |

### Response Format
```json
{
  "data": { },
  "meta": { "page": 1, "total": 100 },
  "errors": [{ "code": "VALIDATION_ERROR", "message": "...", "field": "email" }]
}
```

### Status Codes
- 200: Success
- 201: Created
- 204: No Content (successful delete)
- 400: Bad Request (validation error)
- 401: Unauthorized (no/invalid auth)
- 403: Forbidden (insufficient permissions)
- 404: Not Found
- 409: Conflict (duplicate resource)
- 422: Unprocessable Entity
- 429: Too Many Requests
- 500: Internal Server Error

### Pagination
```
GET /users?page=2&limit=20
GET /users?cursor=abc123&limit=20
```

### Filtering & Sorting
```
GET /users?status=active&role=admin
GET /users?sort=-created_at,name
```

### Versioning
- URL prefix: `/api/v1/users` (recommended for simplicity)
- Header: `Accept: application/vnd.api+json;version=1`

## Design Process

1. **List resources** and their relationships
2. **Define endpoints** for each resource (CRUD + custom actions)
3. **Specify request/response schemas** with examples
4. **Plan authentication** (API key, OAuth, JWT)
5. **Define error responses** with consistent codes
6. **Document** with OpenAPI/Swagger spec
7. **Review** for consistency and completeness
