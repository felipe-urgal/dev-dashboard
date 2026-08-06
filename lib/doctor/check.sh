#!/usr/bin/env bash
# ============================================================
# DOCTOR CHECK — Verificação de dependências
# ============================================================
dev-doctor() {
  local ok=true
  _dev_step "Verificando dependências do Dev Dashboard..."
  echo >&2

  if [[ "${BASH_VERSINFO[0]}" -ge 4 ]]; then
    _dev_ok "Bash ${BASH_VERSION} (>= 4.0)"
  else
    _dev_err "Bash ${BASH_VERSION} muito antigo. Necessário >= 4.0."
    ok=false
  fi

  if _dev_has lsof; then
    _dev_ok "lsof instalado"
  else
    _dev_err "lsof não encontrado. Instale com: sudo apt install lsof / brew install lsof"
    ok=false
  fi

  if _dev_has gum; then
    _dev_ok "gum instalado ($(gum --version 2>/dev/null | head -n1))"
  else
    _dev_warn "gum não encontrado. Interface usará modo texto básico."
    echo "   Instale com: brew install gum (ou veja https://github.com/charmbracelet/gum#installation)" >&2
  fi

  if _dev_has git; then
    _dev_ok "git instalado ($(git --version 2>/dev/null | head -n1))"
  else
    _dev_err "git não encontrado."
    ok=false
  fi

  if _dev_has node; then
    _dev_ok "node instalado ($(node -v 2>/dev/null))"
  else
    _dev_warn "node não encontrado."
  fi

  if _dev_has yarn; then
    _dev_ok "yarn instalado ($(yarn -v 2>/dev/null))"
  else
    _dev_warn "yarn não encontrado."
  fi

  if [[ -n "${NVM_DIR:-}" ]] || _dev_has nvm || declare -f nvm &>/dev/null; then
    _dev_ok "nvm disponível"
  else
    _dev_warn "nvm não encontrado (gerenciador de versões Node)."
  fi

  if _dev_has ruby; then
    _dev_ok "ruby instalado ($(ruby -v 2>/dev/null | awk '{print $2}'))"
  else
    _dev_warn "ruby não encontrado."
  fi

  if _dev_has bundle; then
    _dev_ok "bundler instalado"
  else
    _dev_warn "bundler não encontrado. Instale com: gem install bundler"
  fi

  if _dev_has mysql; then
    _dev_ok "mysql client instalado"
  else
    _dev_warn "mysql client não encontrado (necessário apenas para projetos com MySQL)."
  fi

  if _dev_has mysqldump || _dev_has pg_dump; then
    _dev_ok "cliente de dump de banco instalado (mysqldump/pg_dump)"
  else
    _dev_warn "mysqldump/pg_dump não encontrados (necessários apenas para db:snapshot/db:restore)."
  fi

  if _dev_has gh; then
    _dev_ok "GitHub CLI (gh) instalado ($(gh --version 2>/dev/null | head -n1))"
  else
    _dev_warn "gh não encontrado (necessário apenas para git-pr e detecção de PR em git-publish)."
    echo "   Instale em: https://cli.github.com/" >&2
  fi

  if _dev_has jq; then
    _dev_ok "jq instalado ($(jq --version 2>/dev/null))"
  else
    _dev_warn "jq não encontrado. Detecção de tipo de projeto usa um padrão embutido em vez de shared/project-type-rules.json."
    echo "   Instale com: sudo apt install jq / brew install jq" >&2
  fi

  if [[ -d "${DEV_BASE:-}" ]]; then
    _dev_ok "Pasta base: $DEV_BASE"
  else
    _dev_err "Pasta base não existe: $DEV_BASE"
    ok=false
  fi

  if [[ -d "$DEV_RUN_DIR" ]]; then
    if [[ -w "$DEV_RUN_DIR" ]]; then
      _dev_ok "Diretório de execução: $DEV_RUN_DIR (gravável)"
    else
      _dev_err "Diretório de execução sem permissão de escrita: $DEV_RUN_DIR"
      ok=false
    fi
  else
    _dev_warn "Diretório de execução não existe: $DEV_RUN_DIR (será criado automaticamente)"
  fi

  if [[ -f "${DEV_SECRETS_FILE:-}" ]]; then
    _dev_ok "Arquivo de segredos carregado: $DEV_SECRETS_FILE"
  else
    _dev_warn "Arquivo de segredos não encontrado ($DEV_SECRETS_FILE). Crie-o se precisar de tokens."
  fi

  echo >&2
  if $ok; then
    _dev_ok "Tudo pronto! Execute 'dev-tools' para abrir o dashboard."
  else
    _dev_err "Resolva os problemas acima antes de usar o dashboard."
  fi
}