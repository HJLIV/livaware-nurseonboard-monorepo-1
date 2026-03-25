---
name: azure-enterprise-infra-planner
description: "Architect and provision enterprise Azure infrastructure from workload descriptions. For cloud architects and platform engineers planning networking, identity, security, compliance, and multi-resource topologies with WAF alignment. Generates Bicep or Terraform directly (no azd). WHEN: 'plan Azure infrastructure', 'architect Azure landing zone', 'design hub-spoke network', 'plan multi-region DR topology', 'set up VNets firewalls and private endpoints', 'subscription-scope Bicep deployment'. PREFER azure-prepare FOR app-centric workflows."
---

# Azure Enterprise Infrastructure Planner

Architect enterprise-grade Azure infrastructure with Well-Architected Framework alignment.

## When to Use

- Planning enterprise Azure landing zones
- Designing hub-spoke or mesh network topologies
- Multi-region disaster recovery architecture
- Setting up VNets, firewalls, and private endpoints
- Subscription-scope infrastructure deployments

## Workflow

### Phase 1: Requirements Gathering
- Workload type and scale
- Compliance requirements (SOC2, HIPAA, PCI-DSS)
- Network topology (hub-spoke, mesh, flat)
- Identity and access model
- DR/HA requirements (RPO/RTO targets)
- Cost constraints

### Phase 2: Architecture Design

#### Landing Zone Pattern
```
Management Group
├── Platform
│   ├── Identity (Entra ID, DNS)
│   ├── Management (Monitor, Automation)
│   └── Connectivity (Hub VNet, Firewall, VPN/ExpressRoute)
└── Workloads
    ├── Production
    └── Non-Production
```

#### Hub-Spoke Network
```bash
az network vnet create --name hub-vnet -g hub-rg --address-prefix 10.0.0.0/16
az network vnet create --name spoke1-vnet -g spoke1-rg --address-prefix 10.1.0.0/16
az network vnet peering create --name hub-to-spoke1 --vnet-name hub-vnet -g hub-rg \
  --remote-vnet spoke1-vnet --allow-forwarded-traffic --allow-gateway-transit
```

### Phase 3: Security Design
- Azure Firewall or NVA in hub
- NSGs on all subnets
- Private endpoints for PaaS services
- Azure Policy for governance
- Microsoft Defender for Cloud
- Key Vault for secrets management

### Phase 4: Generate Infrastructure Code

#### Bicep
```bash
az deployment sub create --location <REGION> \
  --template-file infra/main.bicep \
  --parameters infra/parameters.json
```

#### Terraform
```bash
terraform init && terraform plan -out=tfplan && terraform apply tfplan
```

### Phase 5: Validation
- Verify resource deployment
- Test network connectivity
- Validate RBAC assignments
- Run compliance checks
- Document architecture decisions

## WAF Pillars Alignment
| Pillar | Key Considerations |
|--------|--------------------|
| Reliability | Multi-region, availability zones, backup/DR |
| Security | Zero-trust, private endpoints, encryption |
| Cost | Right-sizing, reserved instances, auto-shutdown |
| Operations | Monitoring, alerting, automation |
| Performance | CDN, caching, scaling |
