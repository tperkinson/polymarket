# Agent Operating Context

This repository is a shared knowledge and tooling workspace for Polymarket-related work.

## Required Startup Routine

Before executing a new task in a fresh conversation:

1. Read this file.
2. Read `knowledge/START_HERE.md`.
3. Read the active context files listed there, especially:
   - `knowledge/project-profile.md`
   - `knowledge/tool-registry.md`
   - `knowledge/open-tasks.md`
   - `knowledge/decision-log.md`
   - `knowledge/research-log.md`
4. Run `./scripts/context_snapshot.sh` when a concise full context dump is useful.
5. Identify what must be learned before acting. If the task depends on current markets, APIs, prices, odds, laws, policies, or external services, verify with current sources before relying on memory.

## Execution Gate

Before making changes, confirm enough context exists to act safely. If context is missing but discoverable from the repo or current sources, gather it. Ask the user only when the missing answer is not discoverable and a reasonable assumption would materially change the result.

## Knowledge Maintenance Rules

Update the knowledge system as work happens:

- Add new reusable scripts, workflows, commands, and local utilities to `knowledge/tool-registry.md`.
- Add meaningful product, domain, API, or market findings to `knowledge/research-log.md` with dates and sources.
- Add durable architectural or workflow decisions to `knowledge/decision-log.md`.
- Keep `knowledge/open-tasks.md` current when starting, completing, or deferring work.
- Prefer concise, operational notes over long prose.

## Polymarket-Specific Caution

Polymarket data and rules are time-sensitive. Do not assume stale facts about markets, order books, API behavior, fees, eligibility, legal constraints, or platform policies. Use current sources and record what was checked.

