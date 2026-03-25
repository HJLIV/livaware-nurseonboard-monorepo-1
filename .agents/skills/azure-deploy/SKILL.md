---
name: azure-deploy
description: "Execute Azure deployments for ALREADY-PREPARED applications that have existing .azure/plan.md and infrastructure files. DO NOT use this skill when the user asks to CREATE a new application — use azure-prepare instead. This skill runs azd up, azd deploy, terraform apply, and az deployment commands with built-in error recovery. Requires .azure/plan.md from azure-prepare and validated status from azure-validate. WHEN: \"run azd up\", \"run azd deploy\", \"execute deployment\", \"push to production\", \"push to cloud\", \"go live\", \"ship it\", \"bicep deploy\", \"terraform apply\", \"publish to Azure\", \"launch on Azure\". DO NOT USE WHEN: \"create and deploy\", \"build and deploy\", \"create a new app\", \"set up infrastructure\", \"create and deploy to Azure using Terraform\" — use azure-prepare for these."
---

# Azure Deploy

Execute deployments for already-prepared Azure applications.

## Prerequisites

1. **azure-prepare** was invoked → `.azure/plan.md` exists
2. **azure-validate** was invoked → plan status = `Validated`

If either is missing, invoke the prerequisite skill first:
`azure-prepare` → `azure-validate` → `azure-deploy`

## Triggers

- Execute deployment of an already-prepared application
- Push updates to an existing Azure deployment
- Run `azd up`, `azd deploy`, or `az deployment`

## Deployment Commands

### Using Azure Developer CLI (azd)
```bash
azd auth login
azd up          # provision + deploy
azd deploy      # deploy only (infra already exists)
azd down        # tear down all resources
```

### Using Bicep
```bash
az deployment group create -g <RG> \
  --template-file infra/main.bicep \
  --parameters infra/main.parameters.json
```

### Using Terraform
```bash
cd infra
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

## Post-Deployment Verification
```bash
az webapp show --name <APP> -g <RG> --query "state"
az containerapp show --name <APP> -g <RG> --query "properties.latestRevisionFqdn"
curl -s https://<APP_URL>/health
```

## Error Recovery
| Error | Fix |
|-------|-----|
| Provisioning failed | Check `az deployment group show` for error details |
| Resource conflict | Use `--mode Incremental` (default) not Complete |
| Permission denied | Verify `az role assignment list` for required roles |
| Quota exceeded | Request increase via `az quota` or change region |

## Rules
- Run after azure-prepare and azure-validate
- `.azure/plan.md` must exist with status `Validated`
- Do not manually update plan status — only azure-validate sets it
- Monitor deployment and verify health after completion
