---
name: azure-rbac
description: "Helps users find the right Azure RBAC role for an identity with least privilege access, then generate CLI commands and Bicep code to assign it. Also provides guidance on permissions required to grant roles. WHEN: bicep for role assignment, what role should I assign, least privilege role, RBAC role for, role to read blobs, role for managed identity, custom role definition, assign role to identity, what role do I need to grant access, permissions to assign roles."
---

# Azure RBAC

Find and assign the right Azure RBAC role with least privilege access.

## When to Use

- Finding the minimal role for a specific permission
- Assigning roles to users, groups, or managed identities
- Creating custom role definitions
- Generating Bicep code for role assignments

## Process

### Step 1: Find the Right Role
```bash
az role definition list --query "[?contains(roleName, 'Storage')]" -o table
az role definition list --query "[?contains(description, 'read blob')]" -o table
az role definition show --name "Storage Blob Data Reader"
```

### Common Built-in Roles
| Task | Role | Scope |
|------|------|-------|
| Read blobs | Storage Blob Data Reader | Storage account |
| Write blobs | Storage Blob Data Contributor | Storage account |
| Manage resources | Contributor | Resource group |
| Read-only access | Reader | Subscription/RG |
| Manage identities | Managed Identity Operator | Resource group |
| Key Vault secrets | Key Vault Secrets User | Key Vault |

### Step 2: Assign Role (CLI)
```bash
az role assignment create --assignee <PRINCIPAL_ID> \
  --role "Storage Blob Data Reader" \
  --scope "/subscriptions/<SUB>/resourceGroups/<RG>/providers/Microsoft.Storage/storageAccounts/<ACCOUNT>"
```

### Step 3: Assign Role (Bicep)
```bicep
resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, principalId, roleDefinitionId)
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleDefinitionId)
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}
```

### Custom Role Definition
```bash
az role definition create --role-definition '{
  "Name": "Custom Reader",
  "Description": "Can read specific resources",
  "Actions": ["Microsoft.Storage/storageAccounts/blobServices/containers/read"],
  "NotActions": [],
  "AssignableScopes": ["/subscriptions/<SUB_ID>"]
}'
```

## Prerequisites for Granting Roles
- You need `Microsoft.Authorization/roleAssignments/write` permission
- Typically requires Owner or User Access Administrator role at the target scope
