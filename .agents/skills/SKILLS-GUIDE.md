# Skills Guide

Comprehensive catalog of all installed agent skills organized by category. Each skill provides specialized workflows, checklists, and best practices that can be invoked by name.

## How to Use Skills

Skills are loaded by reading their `SKILL.md` file at `.agents/skills/<skill-name>/SKILL.md`. Each skill includes trigger phrases that indicate when it should be used. Skills can reference other skills to compose complex workflows.

---

## Architecture & Planning

| Skill | Description | Triggers | Source |
|-------|-------------|----------|--------|
| **blueprint** | Create project blueprints and technical specifications before implementation | blueprint, project plan, technical spec, system design | ECC |
| **architecture-decision-records** | Document significant architectural and technical decisions using structured ADR format | ADR, architecture decision, document decision | ECC |
| **autoplan** | Generate structured implementation plans from feature descriptions or requirements | autoplan, plan this, create plan, break this down | gstack |
| **brainstorming** | Explore user intent, requirements and design before creative/implementation work | brainstorm, design first, explore idea | Pre-existing |
| **codebase-onboarding** | Rapidly understand and document an unfamiliar codebase | onboard to codebase, understand this project, explain codebase | ECC |

## Code Quality & Standards

| Skill | Description | Triggers | Source |
|-------|-------------|----------|--------|
| **audit** | Comprehensive code audits for quality, consistency, and best practices | code audit, quality check, anti-pattern detection, technical debt | Impeccable |
| **coding-standards** | Establish and enforce coding standards and conventions | coding standards, code style, linting, formatting | ECC |
| **critique** | Constructive critique of code, design, or architecture with actionable feedback | critique, review, feedback, evaluate, assess | Impeccable |
| **review** | Structured code review process with clear, actionable feedback | code review, PR review, review changes, check this implementation | gstack |
| **polish** | Refine working code to production quality through systematic cleanup | polish code, clean up, refine, production ready | Impeccable |
| **clarify** | Improve code clarity through better naming, structure, and documentation | clarify, improve readability, better naming | Impeccable |
| **normalize** | Make inconsistent code patterns and conventions uniform across a codebase | normalize, standardize, make consistent, unify patterns | Impeccable |
| **distill** | Condense complex code or documentation into essential elements | distill, simplify, condense, reduce complexity | Impeccable |
| **extract** | Extract reusable components, functions, or modules from existing code | extract, refactor, extract component, make reusable, DRY | Impeccable |
| **arrange** | Restructure and reorganize code, files, or project layout | arrange, reorganize, restructure, file structure | Impeccable |
| **guard** | Set up automated guardrails, linting rules, pre-commit hooks, and CI checks | guard, guardrails, pre-commit hooks, CI checks, quality gates | gstack |
| **overdrive** | Apply maximum effort for exceptional quality implementation | overdrive, maximum effort, best possible, no shortcuts | Impeccable |
| **adapt** | Adapt code to work across different environments and platforms | adapt, cross-platform, environment compatibility, portability | Impeccable |
| **optimize** | Identify and resolve performance bottlenecks systematically | optimize, performance, slow, speed up, reduce latency | Impeccable |
| **context-budget** | Manage context window usage efficiently with large codebases | context management, large codebase, token budget | ECC |

## Testing & QA

| Skill | Description | Triggers | Source |
|-------|-------------|----------|--------|
| **tdd-workflow** | Test-Driven Development: write failing tests first, then implement | TDD, test-driven, write tests first, red-green-refactor | ECC |
| **e2e-testing** | Design and implement end-to-end tests for complete user workflows | e2e test, end-to-end test, integration test, user flow test | ECC |
| **qa** | Comprehensive quality assurance with structured test plans and defect tracking | QA, quality assurance, test plan, manual testing, acceptance testing | gstack |
| **webapp-testing** | Test web applications through structured manual and automated approaches | test website, check web app, verify feature, responsive test | awesome-claude-skills |
| **benchmark** | Create and run performance benchmarks to measure code and system performance | benchmark, performance test, measure speed, compare performance | gstack |

## Security

| Skill | Description | Triggers | Source |
|-------|-------------|----------|--------|
| **security-review** | Systematic security review of code, configurations, and architecture | security review, security audit, vulnerability check, OWASP | ECC |
| **harden** | Harden code and infrastructure against failures, attacks, and edge cases | harden, defensive coding, resilience, fault tolerance | Impeccable |
| **azure-compliance** | Run Azure compliance and security audits with azqr and Key Vault checks | compliance scan, security audit, Azure best practices | Pre-existing |

## Design & UI

| Skill | Description | Triggers | Source |
|-------|-------------|----------|--------|
| **frontend-design** | Create distinctive, production-grade frontend interfaces | build web components, pages, styling, beautifying UI | Pre-existing |
| **ui-ux-pro-max** | UI/UX design intelligence with 50+ styles, palettes, font pairings | UI/UX design, plan, build, review UI code | Pre-existing |
| **web-design-guidelines** | Review UI code for Web Interface Guidelines compliance | review UI, check accessibility, audit design | Pre-existing |
| **frontend-patterns** | Common frontend architecture patterns and best practices | frontend architecture, component design, state management | ECC |
| **backend-patterns** | Common backend architecture patterns and best practices | backend architecture, service layer, repository pattern | ECC |
| **delight** | Add delightful micro-interactions and UX touches | delight, micro-interactions, UX polish, engaging UI | Impeccable |
| **animate** | Add purposeful animations and transitions to UI components | animate, animation, motion design, transitions | Impeccable |
| **bolder** | Make UI designs more impactful and visually striking | bolder, more impactful, visual hierarchy, make it pop | Impeccable |
| **quieter** | Reduce visual noise and create calmer, focused interfaces | quieter, less busy, simplify UI, reduce noise, minimal | Impeccable |
| **colorize** | Design and apply cohesive color systems to UI components | colorize, color palette, color scheme, dark mode, theme colors | Impeccable |
| **typeset** | Improve typography for better readability and visual hierarchy | typeset, typography, fonts, text styling, font pairing | Impeccable |

## DevOps & Deployment

| Skill | Description | Triggers | Source |
|-------|-------------|----------|--------|
| **deployment-patterns** | Deployment strategies and patterns for shipping software safely | deployment strategy, CI/CD, blue-green, canary, rolling update | ECC |
| **docker-patterns** | Docker and container best practices for development and production | Docker, Dockerfile, container, docker-compose | ECC |
| **ship** | Pre-release checklist and shipping workflow for deploying to production | ship it, release checklist, deploy to production, go live | gstack |
| **changelog-generator** | Generate changelogs from git history, commits, and pull requests | changelog, release notes, what changed, summarize commits | awesome-claude-skills |

## Azure Cloud

| Skill | Description | Triggers | Source |
|-------|-------------|----------|--------|
| **azure-prepare** | Prepare Azure apps for deployment (infra Bicep/Terraform, azure.yaml, Dockerfiles) | create app, deploy to Azure, generate Terraform/Bicep | Azure (Microsoft) |
| **azure-validate** | Pre-deployment validation for Azure readiness | validate my app, check deployment readiness, preflight checks | Azure (Microsoft) |
| **azure-deploy** | Execute Azure deployments for already-prepared applications | run azd up, execute deployment, push to production | Azure (Microsoft) |
| **azure-cost-optimization** | Identify Azure cost savings from usage and spending data | optimize Azure costs, reduce spending, find cost savings | Azure (Microsoft) |
| **azure-diagnostics** | Debug Azure production issues using AppLens, Monitor, and resource health | debug production issues, troubleshoot container apps/functions/AKS | Azure (Microsoft) |
| **azure-kubernetes** | Plan, create, and configure production-ready AKS clusters | create AKS, provision AKS, AKS networking, AKS SKU | Azure (Microsoft) |
| **azure-compute** | Azure VM and VMSS recommendations, pricing, autoscale, and troubleshooting | Azure VM, VMSS, scale set, recommend, autoscale | Azure (Microsoft) |
| **azure-storage** | Azure Storage Services (Blob, File Shares, Queue, Table, Data Lake) | blob storage, file shares, queue storage, upload files | Azure (Microsoft) |
| **azure-ai** | Azure AI services: Search, Speech, OpenAI, Document Intelligence | AI Search, vector search, speech-to-text, OCR | Azure (Microsoft) |
| **azure-rbac** | Find the right Azure RBAC role with least privilege access | RBAC role, least privilege, role assignment, Bicep for role | Azure (Microsoft) |
| **azure-quotas** | Check and manage Azure quotas and usage across providers | check quotas, service limits, current usage, vCPU limit | Azure (Microsoft) |
| **azure-cloud-migrate** | Assess and migrate cross-cloud workloads to Azure | migrate Lambda to Azure, AWS to Azure, migration assessment | Azure (Microsoft) |
| **azure-resource-visualizer** | Generate Mermaid architecture diagrams from Azure resource groups | architecture diagram, visualize Azure resources, resource topology | Azure (Microsoft) |
| **appinsights-instrumentation** | Instrument webapps with Azure Application Insights telemetry | App Insights SDK, telemetry patterns, instrumentation | Azure (Microsoft) |
| **entra-app-registration** | Microsoft Entra ID app registration, OAuth 2.0, and MSAL integration | app registration, OAuth, MSAL, Entra ID setup | Azure (Microsoft) |
| **azure-enterprise-infra-planner** | Architect enterprise Azure infrastructure with WAF alignment | plan Azure infrastructure, landing zone, hub-spoke network | Azure (Microsoft) |

## Research & Writing

| Skill | Description | Triggers | Source |
|-------|-------------|----------|--------|
| **deep-research** | Conduct thorough, multi-source research on complex topics | deep research, comprehensive analysis, in-depth study | ECC |
| **content-research-writer** | Research topics and generate well-structured content | research and write, create article, technical writing | awesome-claude-skills |
| **continuous-learning** | Capture and apply learnings from past work | lessons learned, retrospective, knowledge capture, runbook | ECC |
| **prompt-optimizer** | Optimize prompts for clarity, specificity, and effectiveness | prompt optimization, prompt engineering, improve prompt | ECC |

## Workflow & Automation

| Skill | Description | Triggers | Source |
|-------|-------------|----------|--------|
| **autonomous-loops** | Patterns for autonomous workflows with feedback loops and self-correction | autonomous workflow, feedback loop, self-correction | ECC |
| **investigate** | Systematic bug investigation through structured debugging | investigate, debug, root cause, trace error, find the bug | gstack |
| **onboard** | Create onboarding experiences for new users or contributors | onboard, onboarding flow, welcome experience, first-run | Impeccable |

## API & Integration

| Skill | Description | Triggers | Source |
|-------|-------------|----------|--------|
| **api-design** | Design RESTful and GraphQL APIs with consistent conventions | API design, REST API, GraphQL schema, endpoint design | ECC |
| **mcp-builder** | Design and build Model Context Protocol servers and tools | MCP server, build tool, custom integration, API wrapper | awesome-claude-skills |
| **database-migrations** | Plan and execute database schema migrations safely | database migration, schema change, add column, alter table | ECC |

## Skill Management

| Skill | Description | Triggers | Source |
|-------|-------------|----------|--------|
| **skill-creator** | Create new agent skills with proper structure and triggers | create skill, new skill, build skill, define capability | awesome-claude-skills |
| **find-skills** | Discover and install agent skills | find a skill, how do I do X, is there a skill for | Pre-existing |

## Framework-Specific (Pre-existing)

| Skill | Description | Triggers | Source |
|-------|-------------|----------|--------|
| **next-best-practices** | Next.js best practices for file conventions, RSC, data patterns | Next.js, RSC, metadata, route handlers | Pre-existing |
| **vercel-react-best-practices** | React performance optimization from Vercel Engineering | React components, performance, bundle optimization | Pre-existing |
| **vercel-react-native-skills** | React Native and Expo best practices for mobile apps | React Native, Expo, mobile performance | Pre-existing |
| **remotion-best-practices** | Best practices for Remotion video creation in React | Remotion, video creation | Pre-existing |
| **supabase-postgres-best-practices** | Postgres performance optimization from Supabase | Postgres queries, schema design, database optimization | Pre-existing |

## Utility (Pre-existing)

| Skill | Description | Triggers | Source |
|-------|-------------|----------|--------|
| **agent-tools** | Run 150+ AI apps via inference.sh CLI | AI apps, image/video generation, LLMs, search | Pre-existing |
| **browser-use** | Automate browser interactions for web testing and data extraction | browser automation, web testing, form filling | Pre-existing |

---

## Source Attribution

| Source | Count | Repository |
|--------|-------|-----------|
| ECC (Everything Claude Code) | 18 | anthropics/everything-claude-code |
| Impeccable | 19 | impeccable-ai/impeccable |
| gstack | 7 | gptstack/gstack |
| Azure (Microsoft) | 16 | microsoft/GitHub-Copilot-for-Azure |
| awesome-claude-skills | 5 | awesome-claude-skills |
| Pre-existing | 13 | (Already installed) |
| **Total** | **78** | |

## Provenance Notes

- **Azure skills** were adapted from the microsoft/GitHub-Copilot-for-Azure repository and rewritten to be self-contained using `az` CLI commands, with all MCP tool references replaced.
- **ECC, Impeccable, gstack, and awesome-claude-skills** were reconstructed from domain knowledge and best practices based on the documented skill names, purposes, and workflows from each source project. Core workflow logic, checklists, and patterns are preserved.
- **Pre-existing skills** (13) were not modified as part of this kit.
