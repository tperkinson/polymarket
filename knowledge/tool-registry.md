# Tool Registry

Document every reusable local tool, script, workflow, or API helper here.

## Registered Tools

| Tool | Location | Purpose | How to Use | Inputs | Outputs | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Context snapshot | `scripts/context_snapshot.sh` | Print the core project knowledge packet for a new conversation. | `./scripts/context_snapshot.sh` | None | Markdown sections from the core knowledge files. | Run before planning or executing substantial work. |

## Registration Rule

When adding a tool, include:

- What problem it solves.
- Exact command or entry point.
- Required environment variables or credentials.
- Expected inputs and outputs.
- Examples for the common path.
- Known limitations, rate limits, or safety constraints.
- How to verify it still works.

