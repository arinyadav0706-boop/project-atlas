# 12 — Metrics

How every number EAGLES shows is calculated.

| Doc | Purpose |
|---|---|
| `01_Metric_Definitions.md` | **The calculation reference.** Plain-English question + exact formula + inputs + exclusions for every implemented metric (workload, velocity, status breakdown, cycle time, time tracking), agreed definitions for planned ones (burndown, throughput, lead time, WIP, predictability), and the checklist for adding a new one. |

**Rule:** a metric is defined here before it is built. Reports are the easiest
place to be quietly wrong, and people staff teams on these numbers.

Related: `docs/10_Roadmap/03_Reporting_Roadmap.md` (what we report and when),
ADR-0020 (report registry), ADR-0030 (time tracking), ADR-0034 (workload model).
