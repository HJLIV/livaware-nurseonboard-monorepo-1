---
name: azure-diagnostics
description: "Debug Azure production issues on Azure using AppLens, Azure Monitor, resource health, and safe triage. WHEN: debug production issues, troubleshoot container apps, troubleshoot functions, troubleshoot AKS, kubectl cannot connect, kube-system/CoreDNS failures, pod pending, crashloop, node not ready, upgrade failures, analyze logs, KQL, insights, image pull failures, cold start issues, health probe failures, resource health, root cause of errors."
---

# Azure Diagnostics

Systematically diagnose and resolve Azure production issues.

## Triggers

- Debug or troubleshoot production issues
- Diagnose errors in Azure services
- Analyze application logs or metrics
- Fix image pull, cold start, or health probe issues
- Troubleshoot AKS clusters, nodes, pods, networking

## Quick Diagnosis Flow

1. **Identify symptoms** — What's failing?
2. **Check resource health** — Is Azure healthy?
3. **Review logs** — What do logs show?
4. **Analyze metrics** — Performance patterns?
5. **Investigate recent changes** — What changed?

## Common Diagnostic Commands

### Resource Health
```bash
az resource show --ids <RESOURCE_ID>
az monitor activity-log list -g <RG> --max-events 20
```

### Container Apps
```bash
az containerapp logs show --name <APP> -g <RG> --follow
az containerapp show --name <APP> -g <RG>
az containerapp revision list --name <APP> -g <RG> -o table
```

### Function Apps
```bash
az functionapp show --name <APP> -g <RG>
az monitor app-insights query --apps <APP-INSIGHTS> -g <RG> \
  --analytics-query "traces | where timestamp > ago(1h) | order by timestamp desc | take 50"
az functionapp config appsettings list --name <APP> -g <RG>
```

### AKS Clusters
```bash
az aks show --name <CLUSTER> -g <RG>
az aks get-credentials --name <CLUSTER> -g <RG>
kubectl get nodes -o wide
kubectl get pods --all-namespaces | grep -v Running
kubectl describe pod <POD> -n <NAMESPACE>
kubectl logs <POD> -n <NAMESPACE> --tail=100
```

### Azure Monitor / Log Analytics (KQL)
```bash
az monitor log-analytics query -w <WORKSPACE_ID> \
  --analytics-query "AppExceptions | where TimeGenerated > ago(1h) | order by TimeGenerated desc | take 20"

az monitor log-analytics query -w <WORKSPACE_ID> \
  --analytics-query "ContainerAppConsoleLogs_CL | where TimeGenerated > ago(1h) | order by TimeGenerated desc | take 50"
```

## Common KQL Queries

### Error Summary
```kql
AppExceptions
| where TimeGenerated > ago(24h)
| summarize count() by outerMessage, bin(TimeGenerated, 1h)
| order by count_ desc
```

### Request Performance
```kql
AppRequests
| where TimeGenerated > ago(1h)
| summarize avg(DurationMs), percentile(DurationMs, 95) by Name
| order by avg_DurationMs desc
```

### Container Crashes
```kql
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1h)
| where Log_s contains "error" or Log_s contains "exception"
| take 50
```

## Troubleshooting by Service

### Container Apps Issues
| Symptom | Check | Fix |
|---------|-------|-----|
| Image pull failure | `az containerapp show` for image config | Fix image name/registry credentials |
| Cold start slow | Check min replicas config | Set `--min-replicas 1` |
| Health probe failing | Check probe path and port | Fix container port/path |
| Revision failed | `az containerapp revision list` | Check revision error details |

### Function Apps Issues
| Symptom | Check | Fix |
|---------|-------|-----|
| Invocation failures | App Insights traces | Check function bindings and code |
| Timeout | Host.json timeout settings | Increase timeout, optimize code |
| Missing settings | `az functionapp config appsettings list` | Add missing app settings |

### AKS Issues
| Symptom | Check | Fix |
|---------|-------|-----|
| Pod CrashLoopBackOff | `kubectl logs <pod>` | Fix container startup/config |
| Pod Pending | `kubectl describe pod` | Check resources, node capacity |
| Node NotReady | `kubectl describe node` | Check node health, disk pressure |
| DNS failures | `kubectl exec -- nslookup` | Restart CoreDNS, check policy |

## Rules
- Start with systematic diagnosis, not guessing
- Check resource health before deep-diving into logs
- Document findings and attempted remediation steps
- Never expose secrets in diagnostic output
