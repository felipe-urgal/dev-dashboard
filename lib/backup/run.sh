#!/usr/bin/env bash
# ============================================================
# dev-backup / dev-restore — Backup e restauração do estado local
# ============================================================
# Cobre o estado do dashboard web:
#   - diretório de configuração (workspaces, favoritos, perfis de
#     ambiente, retenção) — sem o token da API;
#   - diretório de estado (histórico de testes/cobertura/mutações Git).
#
# Opcionalmente (--include-secrets), também cobre ~/.dev-dashboard.secrets
# (segredos do CLI bash).
#
# NÃO cobre:
#   - o token da API (api-token) — é regenerado automaticamente na
#     próxima vez que a API iniciar, não precisa (nem deve) ser copiado
#     entre máquinas;
#   - $DEV_RUN_DIR — estado efêmero de processos rodando; restaurar PIDs
#     de outra máquina não faz sentido.
# ============================================================

dev-backup() {
  local staging
  staging="$(mktemp -d)" || {
    _dev_err "Não foi possível criar diretório temporário."
    return 1
  }

  _backup_run "$staging" "$@"
  local status=$?
  rm -rf "$staging"
  return $status
}

_backup_run() {
  local staging="$1"
  shift

  local include_secrets="no"
  if [[ "${1:-}" == "--include-secrets" ]]; then
    include_secrets="yes"
  fi

  local config_dir state_dir backup_dir timestamp archive_path
  config_dir="$(_backup_config_dir)"
  state_dir="$(_backup_state_dir)"
  backup_dir="$(_backup_default_dir)"
  timestamp="$(_backup_timestamp)"
  archive_path="$backup_dir/dev-dashboard-backup-$timestamp.tar.gz"

  local found="no"

  if [ -d "$config_dir" ]; then
    mkdir -p "$staging/config"
    local entry name
    shopt -s nullglob
    for entry in "$config_dir"/*; do
      [ -f "$entry" ] || continue
      name="$(basename "$entry")"
      [ "$name" = "api-token" ] && continue
      cp "$entry" "$staging/config/$name"
      found="yes"
    done
    shopt -u nullglob
  fi

  if [ -d "$state_dir" ]; then
    cp -r "$state_dir" "$staging/state"
    found="yes"
  fi

  if [ "$include_secrets" = "yes" ] && [ -f "$HOME/.dev-dashboard.secrets" ]; then
    cp "$HOME/.dev-dashboard.secrets" "$staging/dev-dashboard.secrets"
    found="yes"
  fi

  if [ "$found" = "no" ]; then
    _dev_warn "Nenhum estado local encontrado para backup ($config_dir e $state_dir estão vazios ou não existem)."
    return 1
  fi

  mkdir -p "$backup_dir"
  chmod 700 "$backup_dir"

  if ! tar -czf "$archive_path" -C "$staging" .; then
    _dev_err "Falha ao criar o arquivo de backup."
    return 1
  fi
  chmod 600 "$archive_path"

  _dev_ok "Backup criado: $archive_path"
  if [ "$include_secrets" != "yes" ]; then
    echo "   (token da API e ~/.dev-dashboard.secrets NÃO incluídos — use 'dev-backup --include-secrets' para incluí-los)" >&2
  fi
}

dev-restore() {
  local archive_path="${1:-}"

  if [ -z "$archive_path" ] || [ ! -f "$archive_path" ]; then
    _dev_err "Uso: dev-restore <caminho-do-backup.tar.gz>"
    return 1
  fi

  local staging
  staging="$(mktemp -d)" || {
    _dev_err "Não foi possível criar diretório temporário."
    return 1
  }

  _restore_run "$staging" "$archive_path"
  local status=$?
  rm -rf "$staging"
  return $status
}

_restore_run() {
  local staging="$1"
  local archive_path="$2"

  if ! tar -xzf "$archive_path" -C "$staging" 2>/dev/null; then
    _dev_err "Não foi possível extrair '$archive_path' — arquivo corrompido ou não é um .tar.gz válido."
    return 1
  fi

  if [ ! -d "$staging/config" ] && [ ! -d "$staging/state" ]; then
    _dev_err "'$archive_path' não parece um backup do Dev Dashboard (sem config/ nem state/ dentro do arquivo)."
    return 1
  fi

  local config_dir state_dir
  config_dir="$(_backup_config_dir)"
  state_dir="$(_backup_state_dir)"

  local confirm=""
  local prompt="Restaurar vai sobrescrever a configuração local atual em $config_dir e $state_dir. Continuar?"
  if _dev_has gum; then
    gum confirm "$prompt" --default=false --affirmative="Sim" --negative="Não" && confirm="yes"
  else
    read -r -p "$prompt (s/N) " answer
    [[ "$answer" =~ ^[Ss] ]] && confirm="yes"
  fi

  if [ "$confirm" != "yes" ]; then
    _dev_warn "Restauração cancelada."
    return 1
  fi

  if [ -d "$staging/config" ]; then
    mkdir -p "$config_dir"
    chmod 700 "$config_dir"
    cp -r "$staging/config/." "$config_dir/"
    _dev_ok "Configuração restaurada em $config_dir"
  fi

  if [ -d "$staging/state" ]; then
    mkdir -p "$(dirname "$state_dir")"
    rm -rf "$state_dir"
    cp -r "$staging/state" "$state_dir"
    _dev_ok "Estado restaurado em $state_dir"
  fi

  if [ -f "$staging/dev-dashboard.secrets" ]; then
    cp "$staging/dev-dashboard.secrets" "$HOME/.dev-dashboard.secrets"
    chmod 600 "$HOME/.dev-dashboard.secrets"
    _dev_ok "Segredos restaurados em \$HOME/.dev-dashboard.secrets"
  fi

  _dev_ok "Restauração concluída. Um novo token de API será gerado automaticamente na próxima vez que a API iniciar."
}
