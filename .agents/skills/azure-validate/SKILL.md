---
name: azure-validate
description: "Pre-deployment validation for Azure readiness. Run deep checks on configuration, infrastructure (Bicep or Terraform), permissions, and prerequisites before deploying. WHEN: validate my app, check deployment readiness, run preflight checks, verify configuration, check if ready to deploy, validate azure.yaml, validate Bicep, test before deploying, troubleshoot deployment errors, validate Azure Functions, validate function app, validate serverless deployment."
---

# Azure Validate

Pre-deployment validation to ensure Azure applications are ready to deploy.

## When to Use

- Before running azure-deploy
- Checking deployment readiness
- Validating infrastructure code
- Troubleshooting deployment failures

## Validation Checklist

### 1. Plan Exists
```bash
test -f .azure/plan.md && echo "Plan found" || echo "Missing - run azure-prepare first"
```

### 2. Infrastructure Validation

#### Bicep
```bash
az bicep build --file infra/main.bicep
az deployment group validate -g <RG> --template-file infra/main.bicep --parameters infra/main.parameters.json
```

#### Terraform
```bash
cd infra && terraform validate
terraform plan -out=tfplan
```

### 3. Azure CLI Authentication
```bash
az account show
az account list-locations -o table
```

### 4. Permission Check
```bash
az role assignment list --assignee $(az ad signed-in-user show --query id -o tsv) -o table
```

### 5. Quota Check
```bash
az vm list-usage --location <REGION> -o table | head -20
```

### 6. Application Check
- Dockerfile builds successfully (if containerized)
- Application starts locally
- Health endpoint responds
- Required environment variables documented

## Validation Output

Update `.azure/plan.md` status to `Validated` only after all checks pass.

```markdown
## Validation Results
- Infrastructure: PASS/FAIL
- Authentication: PASS/FAIL
- Permissions: PASS/FAIL
- Quotas: PASS/FAIL
- Application: PASS/FAIL
- Overall Status: Validated / Not Ready
```

## Next Steps
If validated, proceed to **azure-deploy**.
