---
name: azure-storage
description: "Azure Storage Services including Blob Storage, File Shares, Queue Storage, Table Storage, and Data Lake. Provides object storage, SMB file shares, async messaging, NoSQL key-value, and big data analytics capabilities. Includes access tiers (hot, cool, archive) and lifecycle management. USE FOR: blob storage, file shares, queue storage, table storage, data lake, upload files, download blobs, storage accounts, access tiers, lifecycle management. DO NOT USE FOR: SQL databases, Cosmos DB (use azure-prepare), messaging with Event Hubs or Service Bus (use azure-messaging)."
---

# Azure Storage

Manage Azure Storage services: Blob, File Shares, Queue, Table, and Data Lake.

## Service Selection

| Service | Use When |
|---------|----------|
| **Blob Storage** | Unstructured data (images, documents, backups, logs) |
| **File Shares** | SMB/NFS file shares for migration or shared access |
| **Queue Storage** | Simple async messaging between components |
| **Table Storage** | NoSQL key-value for structured data |
| **Data Lake** | Big data analytics with hierarchical namespace |

## Common CLI Commands

### Storage Account
```bash
az storage account create --name <NAME> -g <RG> --sku Standard_LRS --kind StorageV2
az storage account show --name <NAME> -g <RG>
az storage account keys list --name <NAME> -g <RG>
```

### Blob Storage
```bash
az storage container create --name <CONTAINER> --account-name <ACCOUNT>
az storage blob upload --file <LOCAL_FILE> --container-name <CONTAINER> --name <BLOB> --account-name <ACCOUNT>
az storage blob download --container-name <CONTAINER> --name <BLOB> --file <OUTPUT> --account-name <ACCOUNT>
az storage blob list --container-name <CONTAINER> --account-name <ACCOUNT> -o table
```

### File Shares
```bash
az storage share create --name <SHARE> --account-name <ACCOUNT>
az storage file upload --share-name <SHARE> --source <FILE> --account-name <ACCOUNT>
```

### Queue Storage
```bash
az storage queue create --name <QUEUE> --account-name <ACCOUNT>
az storage message put --queue-name <QUEUE> --content "<MESSAGE>" --account-name <ACCOUNT>
```

## Access Tiers
| Tier | Use For | Cost |
|------|---------|------|
| **Hot** | Frequently accessed data | Higher storage, lower access |
| **Cool** | Infrequent access (30+ days) | Lower storage, higher access |
| **Archive** | Rarely accessed (180+ days) | Lowest storage, highest access |

## Best Practices
- Use managed identity for authentication (avoid storage keys)
- Enable soft delete for blob recovery
- Configure lifecycle management for automatic tiering
- Use private endpoints for secure access
- Enable versioning for critical data
