#!/usr/bin/env bash
# ============================================================
# PROJECTS — Carregador do módulo de Projetos
# ============================================================

# Arrays associativos globais (precisam ser declarados antes do source)
declare -gA PROJECT_META
declare -gA PROJECT_CONFIG

_projects_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Projects: submódulo não encontrado — $file" >&2
    return 1
  fi
}

_projects_source "$DEV_DASHBOARD_DIR/lib/projects/helpers.sh"
_projects_source "$DEV_DASHBOARD_DIR/lib/projects/config.sh"
_projects_source "$DEV_DASHBOARD_DIR/lib/projects/detect.sh"
_projects_source "$DEV_DASHBOARD_DIR/lib/projects/databases.sh"
_projects_source "$DEV_DASHBOARD_DIR/lib/projects/accessors.sh"
_projects_source "$DEV_DASHBOARD_DIR/lib/projects/list.sh"

if [[ -n "$BASH_VERSION" ]]; then
  export -f load_project_config detect_projects project-list \
           project-path project-type project-port \
           project-needs-mysql project-has-webpack project-databases 2>/dev/null || true
fi