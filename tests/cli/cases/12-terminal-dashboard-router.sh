#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
router="$root/lib/dashboard/router.sh"
terminal_api="$root/scripts/terminal-dashboard-api.mjs"

bash -n "$router"
grep -q '_dev_dashboard_project_record "$project"' "$router"
grep -q '\[ -n "$path" \] || path=\$(project-path "$project")' "$router"
grep -q 'DEV_DASHBOARD_WORKSPACE_ID' "$terminal_api"
grep -q 'project.workspaceId === workspaceId' "$terminal_api"

echo "ok - dashboard terminal preserves selected workspace and router syntax"
