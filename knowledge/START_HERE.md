# Start Here

This is the first file to read after `AGENTS.md` in any new conversation.

## Current State

- Repository initialized on 2026-06-18.
- The workspace is currently a knowledge and tooling foundation, not yet an application.
- No Polymarket-specific app architecture, data model, or production workflow has been chosen yet.
- Assume future work may involve Polymarket research, automation, data analysis, or tool development, but confirm scope from the user's request.

## Startup Checklist

Before executing:

1. Read `knowledge/project-profile.md` for the working assumptions.
2. Read `knowledge/tool-registry.md` for available local tools and how to use them.
3. Read `knowledge/open-tasks.md` for active work.
4. Read `knowledge/decision-log.md` for durable choices already made.
5. Read `knowledge/research-log.md` for known facts and what still needs verification.
6. For volatile external facts, verify current sources and add a dated note.

## Repository Map

- `AGENTS.md` - required operating instructions for future agents.
- `README.md` - short human entry point.
- `knowledge/project-profile.md` - project purpose, assumptions, and boundaries.
- `knowledge/tool-registry.md` - reusable local tools and workflows.
- `knowledge/open-tasks.md` - active and deferred work.
- `knowledge/decision-log.md` - durable decisions with rationale.
- `knowledge/research-log.md` - dated findings and source notes.
- `knowledge/templates/` - copyable formats for tool and research entries.
- `scripts/context_snapshot.sh` - prints the core knowledge packet.

## Working Pattern

When a task creates something reusable, document it before finishing. The next conversation should not need to rediscover how a tool works, where a file lives, or what assumptions were made.

