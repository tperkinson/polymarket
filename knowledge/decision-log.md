# Decision Log

Record durable decisions here. Use dates in `YYYY-MM-DD` format.

## 2026-06-18 - Use a lightweight repository-local knowledge system

Decision: Keep startup context in plain Markdown files under `knowledge/`, with root-level `AGENTS.md` as the required instruction bridge for future conversations.

Rationale: The workspace is empty, so a simple text-first system gives future chats immediate context without committing to an application stack too early.

Impact: New tools and research findings must be registered in the knowledge files as they are created.

