#!/usr/bin/env bash
# ============================================================
# GIT — Carregador dos submódulos Git
# ============================================================
# Este arquivo é carregado durante a inicialização do dashboard.
# Ele carrega de forma segura cada submódulo Git, permitindo que
# o restante do sistema continue funcionando mesmo que algum
# módulo Git esteja ausente.
# ============================================================

# ------------------------------------------------------------
# Função auxiliar local (evita dependência externa)
# ------------------------------------------------------------
_git_source() {
  local file="$1"
  if [[ -f "$file" ]]; then
    source "$file"
  else
    echo "Git: submódulo não encontrado — $file" >&2
    return 1
  fi
}

# ------------------------------------------------------------
# Helpers compartilhados (devem carregar antes dos submódulos)
# ------------------------------------------------------------
_git_source "$DEV_DASHBOARD_DIR/lib/git/helpers.sh"

# ------------------------------------------------------------
# Carregamento dos submódulos (ordem não é crítica)
# ------------------------------------------------------------
_git_source "$DEV_DASHBOARD_DIR/lib/git/commit/init.sh"
_git_source "$DEV_DASHBOARD_DIR/lib/git/delete/init.sh"
_git_source "$DEV_DASHBOARD_DIR/lib/git/log/init.sh"
_git_source "$DEV_DASHBOARD_DIR/lib/git/new/init.sh"
_git_source "$DEV_DASHBOARD_DIR/lib/git/publish/init.sh"
_git_source "$DEV_DASHBOARD_DIR/lib/git/pr/init.sh"
_git_source "$DEV_DASHBOARD_DIR/lib/git/save/init.sh"
_git_source "$DEV_DASHBOARD_DIR/lib/git/stash/init.sh"
_git_source "$DEV_DASHBOARD_DIR/lib/git/status/init.sh"
_git_source "$DEV_DASHBOARD_DIR/lib/git/switch/init.sh"
_git_source "$DEV_DASHBOARD_DIR/lib/git/sync/init.sh"
_git_source "$DEV_DASHBOARD_DIR/lib/git/undo/init.sh"
_git_source "$DEV_DASHBOARD_DIR/lib/git/update/init.sh"
_git_source "$DEV_DASHBOARD_DIR/lib/git/menu/init.sh"
_git_source "$DEV_DASHBOARD_DIR/lib/git/tools/init.sh"