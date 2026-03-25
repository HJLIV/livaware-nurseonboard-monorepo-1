---
name: azure-kubernetes
description: "Plan, create, and configure production-ready Azure Kubernetes Service (AKS) clusters. Covers Day-0 checklist, SKU selection (Automatic vs Standard), networking options (private API server, Azure CNI Overlay, egress configuration), security, and operations (autoscaling, upgrade strategy, cost analysis). WHEN: create AKS environment, provision AKS environment, enable AKS observability, design AKS networking, choose AKS SKU, secure AKS."
---

# Azure Kubernetes Service

Plan and configure production-ready AKS clusters. Distinguishes Day-0 decisions (networking, API server — hard to change later) from Day-1 features (can enable post-creation).

## When to Use

- Create a new AKS cluster
- Plan AKS cluster configuration for production
- Design AKS networking (API server access, pod IP model, egress)
- Configure AKS identity, security, observability
- Choose between AKS Automatic vs Standard SKU

## CLI Reference

```bash
az aks create --name <NAME> -g <RG> --location <REGION> \
  --tier standard --kubernetes-version <VERSION> \
  --network-plugin azure --network-plugin-mode overlay \
  --zones 1 2 3 --node-count 3 --node-vm-size Standard_D4s_v5 \
  --enable-oidc-issuer --enable-workload-identity \
  --enable-managed-identity --generate-ssh-keys

az aks show --name <NAME> -g <RG>
az aks get-credentials --name <NAME> -g <RG>
az aks nodepool list --cluster-name <NAME> -g <RG> -o table
```

## Required Inputs (Ask if Needed)
- Environment type: dev/test or production
- Region(s) and availability zones
- Expected scale (node count, workload size)
- Networking requirements (API server access, pod IP model)
- Security and identity requirements
- Cost constraints

## Workflow

### 1. Cluster Type
- **AKS Automatic** (default): Curated experience with pre-configured best practices
- **AKS Standard**: Full control, more setup overhead

### 2. Networking (Day-0 Decision)
- **Pod IP**: Azure CNI Overlay (recommended) or Azure CNI VNet-routable
- **Dataplane**: Azure CNI powered by Cilium (eBPF, recommended)
- **Egress**: Static Egress Gateway or UDR + Azure Firewall
- **Ingress**: App Routing addon with Gateway API (recommended)
- **DNS**: Enable LocalDNS on all node pools

### 3. Security
- Microsoft Entra ID for control plane and Workload Identity for pods
- Azure Key Vault via Secrets Store CSI Driver
- Azure Policy + Deployment Safeguards
- Allow only signed images (Azure Policy + Ratify)
- Use Azure Container Registry

### 4. Observability
- Managed Prometheus + Container Insights + Grafana
- Diagnostic Settings for control plane logs
- Application Insights for application telemetry

### 5. Upgrades & Patching
- Configure Maintenance Windows
- Enable auto-upgrades for control plane and node OS
- Consider LTS versions for enterprise stability
- Use AKS Fleet Manager for staged rollout

### 6. Node Pools & Compute
- Dedicated system node pool (2+ nodes, tainted CriticalAddonsOnly)
- Enable Node Auto Provisioning (NAP)
- Use latest generation SKUs (v5/v6), avoid B-series
- Minimum 4 vCPUs for production

### 7. Reliability
- Deploy across 3 Availability Zones
- Standard tier for zone-redundant control plane (99.95% SLA)
- Enable Microsoft Defender for Containers
- Configure PodDisruptionBudgets

### 8. Cost Controls
- Spot node pools for batch/interruptible workloads (up to 90% savings)
- Stop/Start dev/test clusters: `az aks stop/start`
- Consider Reserved Instances or Savings Plans

## Error Handling
| Error | Likely Cause | Fix |
|-------|-------------|-----|
| Quota exceeded | Regional vCPU limits | Request quota increase or change region/SKU |
| IP exhaustion | Pod subnet too small | Re-plan IP ranges (may require recreation) |
| Workload Identity failing | Missing OIDC issuer | Enable `--enable-oidc-issuer --enable-workload-identity` |
