#!/usr/bin/env bash
# ============================================================
# BACKUP HELPERS — Resolução de diretórios e nomes de arquivo
# ============================================================

# Resolve o diretório de configuração do dashboard web, espelhando
# packages/core/src/config-directory.ts (mesma ordem de precedência:
# DEV_DASHBOARD_CONFIG_DIR, depois XDG_CONFIG_HOME, depois o padrão).
_backup_config_dir() {
  if [ -n "${DEV_DASHBOARD_CONFIG_DIR:-}" ]; then
    echo "$DEV_DASHBOARD_CONFIG_DIR"
  elif [ -n "${XDG_CONFIG_HOME:-}" ]; then
    echo "$XDG_CONFIG_HOME/dev-dashboard"
  else
    echo "$HOME/.config/dev-dashboard"
  fi
}

# Resolve o diretório de estado do dashboard web (histórico de testes,
# cobertura, mutações Git), espelhando os serviços em apps/api/src/services.
_backup_state_dir() {
  echo "${DEV_DASHBOARD_STATE_DIR:-$HOME/.local/state/dev-dashboard}"
}

# Diretório onde os arquivos .tar.gz de backup são gravados por padrão.
_backup_default_dir() {
  echo "${DEV_DASHBOARD_BACKUP_DIR:-$HOME/.dev-dashboard-backups}"
}

_backup_timestamp() {
  date +%Y%m%d-%H%M%S
}
