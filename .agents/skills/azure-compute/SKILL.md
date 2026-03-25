---
name: azure-compute
description: "Azure VM and VMSS router for recommendations, pricing, autoscale, orchestration, and connectivity troubleshooting. WHEN: Azure VM, VMSS, scale set, recommend, compare, server, website, burstable, lightweight, VM family, workload, GPU, learning, simulation, dev/test, backend, autoscale, load balancer, Flexible orchestration, Uniform orchestration, cost estimate, connect, refused, Linux, black screen, reset password, reach VM, port 3389, NSG, troubleshoot."
---

# Azure Compute

Guide for Azure VM and Virtual Machine Scale Set (VMSS) selection, configuration, and troubleshooting.

## VM Selection Guide

| Workload | Recommended Series | Notes |
|----------|-------------------|-------|
| General purpose | D-series v5 | Balanced CPU/memory |
| Compute intensive | F-series v2 | High CPU-to-memory |
| Memory intensive | E-series v5 | High memory-to-CPU |
| GPU workloads | NC/ND-series | ML training, rendering |
| Dev/test | B-series | Burstable, cost-effective |
| Storage optimized | L-series | High disk throughput |

## Common CLI Commands

### Virtual Machines
```bash
az vm create --name <NAME> -g <RG> --image Ubuntu2204 --size Standard_D2s_v5 \
  --admin-username azureuser --generate-ssh-keys

az vm list -g <RG> -o table
az vm show --name <NAME> -g <RG>
az vm start/stop/restart/deallocate --name <NAME> -g <RG>
az vm list-sizes --location <REGION> -o table
az vm list-usage --location <REGION> -o table
```

### Scale Sets (VMSS)
```bash
az vmss create --name <NAME> -g <RG> --image Ubuntu2204 \
  --instance-count 3 --vm-sku Standard_D2s_v5 \
  --orchestration-mode Flexible

az vmss show --name <NAME> -g <RG>
az vmss scale --name <NAME> -g <RG> --new-capacity 5
```

### Autoscale
```bash
az monitor autoscale create -g <RG> --resource <VMSS_ID> \
  --min-count 2 --max-count 10 --count 3

az monitor autoscale rule create -g <RG> --autoscale-name <NAME> \
  --condition "Percentage CPU > 70 avg 5m" --scale out 1
```

## Orchestration Modes
- **Flexible** (recommended): Mix VM sizes, availability zones, manual+auto scaling
- **Uniform**: Identical VMs, simpler management, legacy workloads

## Troubleshooting

| Issue | Check | Fix |
|-------|-------|-----|
| Can't connect (SSH/RDP) | NSG rules, VM running state | Open port in NSG, start VM |
| Connection refused | Service running, firewall | Start service, check iptables |
| Black screen (RDP) | VM agent, extensions | Reset VM, reinstall agent |
| Slow performance | VM metrics, disk IOPS | Resize VM, use premium disk |

```bash
az vm run-command invoke --name <VM> -g <RG> --command-id RunShellScript --scripts "systemctl status sshd"
az network nsg rule list --nsg-name <NSG> -g <RG> -o table
```
