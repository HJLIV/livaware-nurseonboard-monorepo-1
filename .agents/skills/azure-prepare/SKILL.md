---
name: azure-prepare
description: "Prepare Azure apps for deployment (infra Bicep/Terraform, azure.yaml, Dockerfiles). Use for create/modernize or create+deploy; not cross-cloud migration (use azure-cloud-migrate). WHEN: \"create app\", \"build web app\", \"create API\", \"create serverless HTTP API\", \"create frontend\", \"create back end\", \"build a service\", \"modernize application\", \"update application\", \"add authentication\", \"add caching\", \"host on Azure\", \"create and deploy\", \"deploy to Azure\", \"deploy to Azure using Terraform\", \"deploy to Azure App Service\", \"deploy to Azure Container Apps\", \"generate Terraform\", \"generate Bicep\", \"function app\", \"containerized Node.js app\"."
---

# Azure Prepare

Prepare applications for Azure deployment by generating infrastructure code, configuration, and Dockerfiles.

## When to Use

- Creating a new application to deploy on Azure
- Generating Bicep or Terraform infrastructure code
- Setting up azure.yaml for Azure Developer CLI
- Adding Azure services (auth, caching, storage) to existing app
- Modernizing an application for Azure hosting

## Workflow

### Step 1: Understand Requirements
- What type of app? (web app, API, function, static site)
- Which Azure service? (App Service, Container Apps, Functions, Static Web Apps)
- What infrastructure? (database, cache, storage, queue)
- Which IaC tool? (Bicep or Terraform)

### Step 2: Generate Infrastructure

#### Bicep
```bash
mkdir -p infra
az bicep install  # ensure bicep is available
```

Common resources:
```bicep
// infra/main.bicep
param location string = resourceGroup().location
param appName string

resource appServicePlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: '${appName}-plan'
  location: location
  sku: { name: 'B1' }
  kind: 'linux'
  properties: { reserved: true }
}

resource webApp 'Microsoft.Web/sites@2022-09-01' = {
  name: appName
  location: location
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: { linuxFxVersion: 'NODE|20-lts' }
  }
}
```

#### Terraform
```hcl
# infra/main.tf
provider "azurerm" { features {} }

resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
}
```

### Step 3: Create azure.yaml (for azd)
```yaml
name: my-app
services:
  web:
    project: ./src
    language: js
    host: appservice
```

### Step 4: Create Dockerfile (if Container Apps)
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### Step 5: Document Plan
Write `.azure/plan.md` with:
- Architecture summary
- Resources to be provisioned
- Configuration decisions and rationale
- Status: `Prepared` (changes to `Validated` after azure-validate)

## Next Steps
After preparation: invoke **azure-validate** to verify readiness, then **azure-deploy** to deploy.
