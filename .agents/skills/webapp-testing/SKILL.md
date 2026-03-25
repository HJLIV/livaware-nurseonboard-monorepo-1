---
name: webapp-testing
description: "Test web applications through structured manual and automated testing approaches. Use when validating web features, checking responsive design, or verifying cross-browser compatibility. Triggers: test website, check web app, verify feature, responsive test, browser testing."
---

# Web App Testing

Comprehensive testing strategies for web applications.

## When to Use

- Testing a completed web feature
- Checking responsive design across devices
- Validating user flows
- Pre-deployment web app verification

## Testing Checklist

### Functional Testing
- [ ] All links work (no broken links)
- [ ] Forms submit correctly
- [ ] Validation messages appear for invalid input
- [ ] Success/error states shown properly
- [ ] Navigation works as expected
- [ ] Search functionality returns correct results
- [ ] Authentication flows work (login, logout, register)
- [ ] Authorization (users can only access allowed content)

### Responsive Design
- [ ] Layout correct at mobile (320-480px)
- [ ] Layout correct at tablet (768px)
- [ ] Layout correct at desktop (1024px+)
- [ ] Layout correct at large desktop (1440px+)
- [ ] Images scale properly
- [ ] Text readable at all sizes
- [ ] Touch targets large enough on mobile (44x44px min)
- [ ] No horizontal scrolling on mobile

### Performance
- [ ] Page loads in under 3 seconds
- [ ] Images are optimized (WebP, lazy loading)
- [ ] No layout shift during loading (CLS < 0.1)
- [ ] First input delay acceptable (FID < 100ms)
- [ ] Largest contentful paint acceptable (LCP < 2.5s)

### Accessibility
- [ ] All images have alt text
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] Keyboard navigation works for all interactive elements
- [ ] Focus indicators visible
- [ ] Screen reader can read content logically
- [ ] Form labels are properly associated
- [ ] ARIA attributes used correctly

### Cross-Browser
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome (Android)

### Security
- [ ] HTTPS enforced
- [ ] No mixed content warnings
- [ ] CSP headers configured
- [ ] Cookies set with appropriate flags
- [ ] No sensitive data in URLs

## Test Report Format
```markdown
## Web App Test Report

### Summary
- Pages tested: [N]
- Issues found: [Critical: N, High: N, Medium: N, Low: N]

### Issues
| # | Severity | Page | Description | Screenshot |
|---|----------|------|-------------|------------|
| 1 | High | /checkout | Form doesn't validate email | [link] |
```
