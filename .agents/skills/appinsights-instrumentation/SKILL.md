---
name: appinsights-instrumentation
description: "Guidance for instrumenting webapps with Azure Application Insights. Provides telemetry patterns, SDK setup, and configuration references. WHEN: how to instrument app, App Insights SDK, telemetry patterns, what is App Insights, Application Insights guidance, instrumentation examples, APM best practices."
---

# Application Insights Instrumentation

Guide for instrumenting applications with Azure Application Insights for monitoring and diagnostics.

## When to Use

- Adding telemetry to a web application
- Setting up Application Insights monitoring
- Configuring custom metrics and traces
- Debugging production performance issues

## Setup

### Create App Insights Resource
```bash
az monitor app-insights component create --app <NAME> -g <RG> --location <REGION> \
  --kind web --application-type web

az monitor app-insights component show --app <NAME> -g <RG> \
  --query "connectionString" -o tsv
```

### Node.js / TypeScript
```javascript
const { ApplicationInsightsClient } = require('applicationinsights');

const appInsights = require('applicationinsights');
appInsights.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
  .setAutoCollectRequests(true)
  .setAutoCollectPerformance(true)
  .setAutoCollectExceptions(true)
  .start();
```

### Python
```python
from opencensus.ext.azure.trace_exporter import AzureExporter
from opencensus.trace.tracer import Tracer

tracer = Tracer(
    exporter=AzureExporter(connection_string=os.environ['APPLICATIONINSIGHTS_CONNECTION_STRING'])
)
```

### .NET
```csharp
builder.Services.AddApplicationInsightsTelemetry();
```

## Custom Telemetry

### Track Custom Events
```javascript
const client = appInsights.defaultClient;
client.trackEvent({ name: 'UserSignup', properties: { plan: 'premium' } });
client.trackMetric({ name: 'OrderTotal', value: 99.99 });
client.trackException({ exception: new Error('Payment failed') });
```

## Querying Data (KQL)
```bash
az monitor app-insights query --apps <NAME> -g <RG> \
  --analytics-query "requests | summarize count() by resultCode | order by count_ desc"
```

## Best Practices
- Use connection string (not instrumentation key)
- Set sampling rate for high-volume apps
- Add custom dimensions for business context
- Use availability tests for uptime monitoring
- Set up smart detection alerts
- Use Application Map for dependency visualization
