#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
router="$root/lib/dashboard/router.sh"

grep -q '_dev_dashboard_project_record "$project"' "$router"
grep -q '\[ -n "$path" \] || path=\$(project-path "$project")' "$router"

echo "ok - dashboard router preserves API-discovered project path"
