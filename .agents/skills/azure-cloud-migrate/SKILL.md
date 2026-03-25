---
name: azure-cloud-migrate
description: "Assess and migrate cross-cloud workloads to Azure with migration reports and code conversion guidance. Supports AWS, GCP, and other providers. WHEN: migrate Lambda to Azure Functions, migrate AWS to Azure, Lambda migration assessment, convert AWS serverless to Azure, migration readiness report, migrate from AWS, migrate from GCP, cross-cloud migration."
---

# Azure Cloud Migration

Assess and migrate workloads from AWS, GCP, or other clouds to Azure.

## When to Use

- Migrating from AWS/GCP to Azure
- Assessing migration readiness
- Converting cloud-specific services to Azure equivalents
- Creating migration plans and reports

## Service Mapping

### AWS to Azure
| AWS Service | Azure Equivalent | Notes |
|-------------|-----------------|-------|
| Lambda | Azure Functions | Serverless compute |
| EC2 | Virtual Machines | IaaS compute |
| S3 | Blob Storage | Object storage |
| RDS | Azure SQL / PostgreSQL | Managed databases |
| DynamoDB | Cosmos DB | NoSQL database |
| SQS | Queue Storage / Service Bus | Messaging |
| API Gateway | API Management | API gateway |
| CloudFront | Azure CDN / Front Door | CDN |
| ECS/EKS | Container Apps / AKS | Container orchestration |
| CloudWatch | Azure Monitor | Monitoring |

### GCP to Azure
| GCP Service | Azure Equivalent | Notes |
|-------------|-----------------|-------|
| Cloud Functions | Azure Functions | Serverless |
| Compute Engine | Virtual Machines | IaaS |
| Cloud Storage | Blob Storage | Object storage |
| Cloud SQL | Azure SQL | Managed SQL |
| BigQuery | Synapse Analytics | Data warehouse |
| GKE | AKS | Kubernetes |

## Migration Process

### Step 1: Assessment
```bash
az account show
az group list -o table
```
- Inventory current cloud resources
- Identify dependencies and data flows
- Assess migration complexity for each component

### Step 2: Migration Report
```markdown
# Migration Assessment Report

## Current Architecture
[Document existing services and dependencies]

## Proposed Azure Architecture
[Map each service to Azure equivalent]

## Migration Phases
1. [Component]: [AWS/GCP service] → [Azure service]
   - Complexity: Low/Medium/High
   - Data migration: [Strategy]
   - Code changes: [Summary]

## Risks
- [Risk]: [Mitigation]

## Timeline Estimate
- Phase 1: X weeks
- Phase 2: X weeks
```

### Step 3: Code Conversion
- Convert IAM policies to Azure RBAC
- Convert CloudFormation/Terraform to Bicep/ARM
- Update SDK calls (AWS SDK → Azure SDK)
- Migrate secrets to Azure Key Vault
- Update CI/CD pipelines

### Step 4: Data Migration
- Use Azure Data Factory for large data transfers
- Azure Database Migration Service for databases
- AzCopy for blob/object storage migration
