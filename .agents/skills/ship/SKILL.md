---
name: ship
description: "Pre-release checklist and shipping workflow for deploying features to production. Use when preparing to deploy, creating release checklists, or validating readiness for production. Triggers: ship it, release checklist, deploy to production, go live, ready to ship, launch."
---

# Ship

Pre-release validation and deployment workflow for shipping features safely.

## When to Use

- Preparing a feature or release for production
- Running through pre-deployment checks
- User says "ship it", "deploy", or "go live"
- Final validation before release

## Pre-Ship Checklist

### Code Quality
- [ ] All tests passing
- [ ] No linting errors or warnings
- [ ] Code reviewed and approved
- [ ] No TODO/FIXME items remaining
- [ ] No debug/console.log statements
- [ ] Dependencies up to date and audited

### Functionality
- [ ] Feature matches requirements/spec
- [ ] Happy path verified
- [ ] Edge cases tested
- [ ] Error states handled gracefully
- [ ] Backwards compatibility maintained (if applicable)

### Data & Infrastructure
- [ ] Database migrations tested
- [ ] Environment variables configured for production
- [ ] Secrets rotated if needed
- [ ] Monitoring and alerting set up
- [ ] Logging sufficient for debugging

### Security
- [ ] No secrets in code or logs
- [ ] Input validation complete
- [ ] Authentication/authorization verified
- [ ] HTTPS enforced
- [ ] Rate limiting in place

### Documentation
- [ ] README updated
- [ ] API docs current
- [ ] Changelog updated
- [ ] Runbook available for operations

### Deployment
- [ ] Deployment script tested
- [ ] Rollback procedure documented
- [ ] Stakeholders notified
- [ ] Deployment window agreed upon

## Deployment Process

1. **Announce**: Notify stakeholders of planned deployment
2. **Backup**: Snapshot database and current state
3. **Deploy**: Execute deployment (staging first if available)
4. **Verify**: Run smoke tests and health checks
5. **Monitor**: Watch metrics for 15-30 minutes
6. **Confirm**: Mark deployment as successful or rollback

## Rollback Criteria
- Error rate increases above baseline
- Response time exceeds acceptable threshold
- Health checks failing
- Critical bug reported by users
- Data integrity issues detected
