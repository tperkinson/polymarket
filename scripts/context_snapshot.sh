#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

print_file() {
  local path="$1"
  local label="$2"

  if [[ -f "$ROOT_DIR/$path" ]]; then
    printf '\n\n===== %s: %s =====\n\n' "$label" "$path"
    sed -n '1,220p' "$ROOT_DIR/$path"
  else
    printf '\n\n===== Missing: %s =====\n\n' "$path"
  fi
}

printf 'Polymarket workspace context snapshot\n'
printf 'Generated: %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')"
printf 'Root: %s\n' "$ROOT_DIR"

print_file "AGENTS.md" "Agent instructions"
print_file "knowledge/START_HERE.md" "Start here"
print_file "knowledge/project-profile.md" "Project profile"
print_file "knowledge/tool-registry.md" "Tool registry"
print_file "knowledge/open-tasks.md" "Open tasks"
print_file "knowledge/decision-log.md" "Decision log"
print_file "knowledge/research-log.md" "Research log"

