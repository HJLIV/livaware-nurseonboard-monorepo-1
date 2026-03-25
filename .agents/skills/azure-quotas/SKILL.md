---
name: azure-quotas
description: "Check/manage Azure quotas and usage across providers. For deployment planning, capacity validation, region selection. WHEN: \"check quotas\", \"service limits\", \"current usage\", \"request quota increase\", \"quota exceeded\", \"validate capacity\", \"regional availability\", \"provisioning limits\", \"vCPU limit\", \"how many vCPUs available in my subscription\"."
---

# Azure Quotas

Check and manage Azure quotas, usage limits, and capacity across providers.

## When to Use

- Checking available capacity before provisioning
- Diagnosing "quota exceeded" deployment failures
- Planning regional resource allocation
- Requesting quota increases

## Common Quota Commands

### VM/Compute Quotas
```bash
az vm list-usage --location <REGION> -o table
az vm list-usage --location eastus --query "[?contains(name.value, 'vCPUs')]" -o table
```

### Network Quotas
```bash
az network list-usages --location <REGION> -o table
```

### Storage Quotas
```bash
az storage account list --query "length(@)"
```

### General Quota Check
```bash
az quota list --scope "/subscriptions/<SUB_ID>/providers/Microsoft.Compute/locations/<REGION>" -o table
az quota usage list --scope "/subscriptions/<SUB_ID>/providers/Microsoft.Compute/locations/<REGION>" -o table
```

### Request Quota Increase
```bash
az quota create --resource-name "standardDSv3Family" \
  --scope "/subscriptions/<SUB_ID>/providers/Microsoft.Compute/locations/<REGION>" \
  --limit-object value=100 limit-object-type=LimitValue \
  --resource-type "dedicated"
```

## Common Quota Types

| Resource | Default Limit | Check Command |
|----------|--------------|---------------|
| Total Regional vCPUs | 10-200 | `az vm list-usage -l <REGION>` |
| VM Family vCPUs | Varies | `az vm list-usage -l <REGION>` |
| Public IP addresses | 10 | `az network list-usages -l <REGION>` |
| Storage accounts | 250/subscription | `az storage account list` |
| VNets per subscription | 50 | `az network list-usages -l <REGION>` |

## Troubleshooting Quota Exceeded

1. Check current usage: `az vm list-usage --location <REGION> -o table`
2. Identify the exceeded quota
3. Options:
   - Use a different VM size/family
   - Deploy in a different region
   - Request quota increase (takes 24-72 hours)
   - Delete unused resources to free quota
