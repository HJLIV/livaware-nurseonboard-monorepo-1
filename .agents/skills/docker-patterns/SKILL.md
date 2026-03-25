---
name: docker-patterns
description: "Docker and container best practices for development and production. Use when creating Dockerfiles, docker-compose configs, or containerizing applications. Triggers: Docker, Dockerfile, container, docker-compose, containerization, container security."
---

# Docker Patterns

Best practices for containerizing applications with Docker.

## When to Use

- Creating or reviewing Dockerfiles
- Setting up docker-compose for development
- Optimizing container images
- Planning container deployment strategy

## Dockerfile Best Practices

### Multi-Stage Builds
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Layer Optimization
- Copy dependency files first, then source code
- Combine RUN commands with `&&` to reduce layers
- Use `.dockerignore` to exclude unnecessary files
- Pin base image versions (don't use `latest`)

### Security
- Use non-root user: `USER node` or `USER 1001`
- Use minimal base images (alpine, distroless)
- Don't store secrets in images
- Scan images for vulnerabilities
- Keep base images updated

## Docker Compose Patterns

### Development Setup
```yaml
services:
  app:
    build: .
    volumes:
      - .:/app
      - /app/node_modules
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

### Common Patterns
- Use health checks for dependency ordering
- Named volumes for persistent data
- Environment files for configuration
- Override files for dev/prod differences
- Network isolation between services

## Image Size Optimization
- Alpine base images (5MB vs 100MB+)
- Multi-stage builds (don't ship build tools)
- Clean up package manager caches
- Use `.dockerignore` aggressively
- Consider distroless for production
