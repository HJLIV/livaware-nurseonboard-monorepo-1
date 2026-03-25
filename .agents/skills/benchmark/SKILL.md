---
name: benchmark
description: "Create and run performance benchmarks to measure code and system performance. Use when measuring execution speed, comparing implementations, or establishing performance baselines. Triggers: benchmark, performance test, measure speed, compare performance, load test, stress test."
---

# Benchmark

Measure and compare performance of code, queries, and systems.

## When to Use

- Measuring execution speed of code
- Comparing performance of different implementations
- Establishing performance baselines
- Validating optimization improvements
- Load or stress testing

## Benchmarking Process

### Step 1: Define What to Measure
- Identify the specific operation to benchmark
- Choose the metric (latency, throughput, memory, CPU)
- Define the expected scale (1 user, 100 users, 10K users)
- Set performance targets

### Step 2: Create Reproducible Tests
- Isolate the code under test
- Control external factors (network, database state, cache)
- Use realistic data volumes
- Warm up before measuring (avoid cold-start bias)

### Step 3: Run Benchmarks
- Run multiple iterations (minimum 10, ideally 100+)
- Record min, max, median, p95, p99
- Monitor system resources during run
- Test under realistic conditions

### Step 4: Analyze Results

```markdown
## Benchmark Report: [Test Name]

### Configuration
- Environment: [Description]
- Data size: [N records]
- Iterations: [N]

### Results
| Metric | Value |
|--------|-------|
| Min | Xms |
| Median | Xms |
| P95 | Xms |
| P99 | Xms |
| Max | Xms |
| Throughput | X ops/sec |

### Comparison (if applicable)
| Implementation | Median | P95 | Memory |
|---------------|--------|-----|--------|
| Before | Xms | Xms | XMB |
| After | Xms | Xms | XMB |
| Improvement | X% | X% | X% |

### Analysis
[Observations and recommendations]
```

### Step 5: Monitor Over Time
- Save benchmark results for historical comparison
- Run benchmarks in CI to catch regressions
- Set alerts for performance degradation

## Common Benchmark Types
- **Micro**: Single function or operation
- **Integration**: End-to-end API request
- **Load**: Sustained traffic at expected volume
- **Stress**: Traffic beyond expected limits
- **Spike**: Sudden burst of traffic
