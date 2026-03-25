---
name: optimize
description: "Optimize code, queries, or systems for better performance. Use when dealing with slow responses, high resource usage, or performance bottlenecks. Triggers: optimize, performance, slow, speed up, reduce latency, improve performance."
---

# Optimize

Identify and resolve performance bottlenecks systematically.

## When to Use

- Application is slow or unresponsive
- High CPU, memory, or database usage
- User reports performance issues
- Preparing for increased load

## Optimization Process

### Step 1: Measure
- Identify what's slow (don't guess, measure)
- Establish baseline metrics
- Profile the specific operation
- Set a target improvement goal

### Step 2: Analyze
- Find the bottleneck (CPU, memory, I/O, network)
- Check for N+1 queries
- Look for unnecessary computations
- Identify blocking operations

### Step 3: Optimize
- Fix the biggest bottleneck first
- Apply one optimization at a time
- Measure improvement after each change
- Stop when target is met

### Step 4: Verify
- Run benchmarks to confirm improvement
- Check for regressions in other areas
- Verify correctness (optimization didn't break behavior)
- Document what was changed and why

## Common Optimizations

### Database
- Add indexes for frequent query conditions
- Use EXPLAIN to analyze query plans
- Batch multiple queries into one
- Use pagination for large result sets
- Cache frequently accessed, rarely changing data
- Avoid SELECT * — fetch only needed columns

### API/Network
- Reduce payload sizes
- Use compression (gzip/brotli)
- Implement caching (HTTP cache headers, CDN)
- Batch API calls where possible
- Use pagination for lists
- Consider GraphQL for flexible data fetching

### Frontend
- Lazy load below-the-fold content
- Optimize images (WebP, responsive sizes)
- Code split by route
- Debounce/throttle expensive event handlers
- Virtualize long lists
- Minimize DOM operations

### Backend
- Use connection pooling
- Implement caching (Redis, in-memory)
- Process heavy work asynchronously (queues)
- Use streaming for large data
- Profile and optimize hot paths

## Rules
- Never optimize without measuring first
- Optimize for the common case
- Readability > micro-optimization
- Cache invalidation must be correct
