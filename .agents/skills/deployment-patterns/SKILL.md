---
name: deployment-patterns
description: "Deployment strategies and patterns for shipping software safely. Use when planning deployments, setting up CI/CD, or choosing deployment strategies. Triggers: deployment strategy, CI/CD, blue-green, canary deployment, rolling update, release management."
---

# Deployment Patterns

Strategies and patterns for deploying software safely and efficiently.

## When to Use

- Planning deployment strategy for a new service
- Setting up CI/CD pipelines
- Choosing between deployment approaches
- Reducing deployment risk

## Deployment Strategies

### Rolling Update
- Replace instances one at a time
- Zero downtime
- Easy rollback (stop the roll)
- Risk: mixed versions during deployment

### Blue-Green
- Two identical environments (blue = current, green = new)
- Switch traffic all at once
- Instant rollback (switch back)
- Cost: double infrastructure during deployment

### Canary
- Route small % of traffic to new version
- Monitor for errors before full rollout
- Gradual confidence building
- Best for high-traffic services

### Feature Flags
- Deploy code without activating features
- Enable features per user/group/percentage
- Decouple deployment from release
- Kill switch for problematic features

## CI/CD Pipeline Stages

```
Code Push → Build → Test → Stage → Deploy → Monitor
              ↓       ↓       ↓       ↓        ↓
           Compile  Unit   Deploy   Prod    Health
           Lint     E2E    to QA    Deploy  Alerts
           Audit    Perf   Smoke    Smoke   Metrics
```

### Pipeline Best Practices
- Fast feedback (unit tests first, slow tests later)
- Fail fast on critical checks
- Immutable artifacts (build once, deploy everywhere)
- Environment parity (staging ≈ production)
- Automated rollback on failure

## Pre-Deployment Checklist
- [ ] All tests passing
- [ ] Database migrations ready and tested
- [ ] Environment variables configured
- [ ] Monitoring and alerting set up
- [ ] Rollback procedure documented
- [ ] Communication plan for stakeholders

## Post-Deployment Checklist
- [ ] Health checks passing
- [ ] Key metrics within normal range
- [ ] No increase in error rates
- [ ] Performance within acceptable bounds
- [ ] Smoke tests passing
