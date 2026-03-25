---
name: azure-cost-optimization
description: "Identify Azure cost savings from usage and spending data. USE FOR: optimize Azure costs, reduce Azure spending/expenses, analyze Azure costs, find cost savings, generate cost optimization report, identify orphaned resources to delete, rightsize VMs, reduce waste, optimize Redis costs, optimize storage costs. DO NOT USE FOR: deploying resources (use azure-deploy), general Azure diagnostics (use azure-diagnostics), security issues (use azure-security)"
---

# Azure Cost Optimization Skill

Analyze Azure subscriptions to identify cost savings through orphaned resource cleanup, rightsizing, and optimization recommendations based on actual usage data.

## When to Use

- Optimize Azure costs or reduce spending
- Analyze Azure subscription for cost savings
- Generate cost optimization report
- Find orphaned or unused resources
- Rightsize Azure VMs, containers, or services

## Prerequisites

- Azure CLI installed and authenticated (`az login`)
- Azure CLI extensions: `costmanagement`, `resource-graph`
- Permissions: Cost Management Reader, Monitoring Reader, Reader role

```bash
az --version
az account show
az extension add --name costmanagement 2>/dev/null
az extension add --name resource-graph 2>/dev/null
```

## Process

### Step 1: Discover Resources

```bash
az account show
az resource list --subscription "<SUBSCRIPTION_ID>" -o table
az resource list -g "<RESOURCE_GROUP>" -o table
```

### Step 2: Find Orphaned Resources (Resource Graph)

```bash
az graph query -q "Resources | where type =~ 'microsoft.network/publicipaddresses' and properties.ipConfiguration == '' | project name, resourceGroup, type"
az graph query -q "Resources | where type =~ 'microsoft.compute/disks' and managedBy == '' | project name, resourceGroup, properties.diskSizeGB"
az graph query -q "Resources | where type =~ 'microsoft.network/networkinterfaces' and properties.virtualMachine == '' | project name, resourceGroup"
```

### Step 3: Query Actual Costs (Last 30 Days)

```bash
START_DATE=$(date -d '-30 days' '+%Y-%m-%dT00:00:00Z' 2>/dev/null || date -v-30d '+%Y-%m-%dT00:00:00Z')
END_DATE=$(date '+%Y-%m-%dT00:00:00Z')

az rest --method post \
  --url "https://management.azure.com/subscriptions/<SUB_ID>/providers/Microsoft.CostManagement/query?api-version=2023-11-01" \
  --body "{\"type\":\"ActualCost\",\"timeframe\":\"Custom\",\"timePeriod\":{\"from\":\"$START_DATE\",\"to\":\"$END_DATE\"},\"dataset\":{\"granularity\":\"None\",\"aggregation\":{\"totalCost\":{\"name\":\"Cost\",\"function\":\"Sum\"}},\"grouping\":[{\"type\":\"Dimension\",\"name\":\"ResourceId\"}]}}"
```

### Step 4: Collect Utilization Metrics

```bash
az monitor metrics list --resource "<RESOURCE_ID>" \
  --metric "Percentage CPU" --interval PT1H --aggregation Average \
  --start-time "$START_DATE" --end-time "$END_DATE"

az monitor metrics list --resource "<RESOURCE_ID>" \
  --metric "CpuTime,Requests" --interval PT1H --aggregation Total \
  --start-time "$START_DATE" --end-time "$END_DATE"
```

### Step 5: Generate Optimization Report

```markdown
# Azure Cost Optimization Report

## Executive Summary
- Total Monthly Cost: $X
- Top Cost Drivers: [Top 3 resources]

## Orphaned Resources (Immediate Savings)
| Resource | Type | Resource Group | Est. Monthly Cost |
|----------|------|----------------|-------------------|

## Rightsizing Recommendations
| Resource | Current SKU | Avg CPU % | Recommended SKU | Est. Savings |
|----------|-------------|-----------|-----------------|--------------|

## Priority Actions
### P1: High Impact, Low Risk
[Delete orphaned resources]

### P2: Medium Impact
[Rightsize underutilized VMs]

### P3: Long-term
[Reserved Instances, storage tiering]

## Total Estimated Savings: $X/month ($Y/year)
```

## Data Classification
- ACTUAL DATA = Retrieved from Azure Cost Management API
- ACTUAL METRICS = Retrieved from Azure Monitor
- ESTIMATED SAVINGS = Calculated from actual data

## Safety
- Get approval before deleting resources
- Test changes in non-production first
- Never execute destructive operations without explicit approval
