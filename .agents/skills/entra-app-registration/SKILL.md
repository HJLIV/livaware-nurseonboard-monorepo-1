---
name: entra-app-registration
description: "Guides Microsoft Entra ID app registration, OAuth 2.0 authentication, and MSAL integration. USE FOR: create app registration, register Azure AD app, configure OAuth, set up authentication, add API permissions, generate service principal, MSAL example, console app auth, Entra ID setup, Azure AD authentication. DO NOT USE FOR: Azure RBAC or role assignments (use azure-rbac), Key Vault secrets (use azure-keyvault-expiration-audit), Azure resource security (use azure-security)."
---

# Entra App Registration

Guide for Microsoft Entra ID (Azure AD) app registration, OAuth 2.0 flows, and MSAL integration.

## When to Use

- Registering an app in Microsoft Entra ID
- Configuring OAuth 2.0 authentication
- Setting up MSAL in a web or console application
- Managing API permissions and scopes

## Create App Registration

```bash
az ad app create --display-name "<APP_NAME>" \
  --sign-in-audience AzureADMyOrg \
  --web-redirect-uris "https://localhost:3000/auth/callback"

az ad app list --display-name "<APP_NAME>" --query "[0].appId" -o tsv
```

## Create Service Principal

```bash
az ad sp create --id <APP_ID>
az ad sp credential reset --id <APP_ID>
```

## Add API Permissions

```bash
az ad app permission add --id <APP_ID> \
  --api 00000003-0000-0000-c000-000000000000 \
  --api-permissions e1fe6dd8-ba31-4d61-89e7-88639da4683d=Scope

az ad app permission admin-consent --id <APP_ID>
```

### Common Microsoft Graph Permissions
| Permission | Type | Description |
|-----------|------|-------------|
| User.Read | Delegated | Sign in and read user profile |
| Mail.Read | Delegated | Read user mail |
| Files.Read | Delegated | Read user files |
| Application.Read.All | Application | Read all applications |

## OAuth 2.0 Flows

### Authorization Code (Web Apps)
1. Redirect user to `/authorize` endpoint
2. Receive auth code at redirect URI
3. Exchange code for tokens at `/token` endpoint

### Client Credentials (Daemon/Service)
```bash
curl -X POST "https://login.microsoftonline.com/<TENANT>/oauth2/v2.0/token" \
  -d "client_id=<APP_ID>&scope=https://graph.microsoft.com/.default&client_secret=<SECRET>&grant_type=client_credentials"
```

### MSAL.js (Browser)
```javascript
const msalConfig = {
  auth: {
    clientId: "<APP_ID>",
    authority: "https://login.microsoftonline.com/<TENANT>",
    redirectUri: "https://localhost:3000"
  }
};
const msalInstance = new msal.PublicClientApplication(msalConfig);
await msalInstance.loginPopup({ scopes: ["User.Read"] });
```

## Best Practices
- Use certificates over client secrets for production
- Request minimum necessary permissions
- Use managed identity when running on Azure
- Rotate credentials regularly
- Enable conditional access policies
