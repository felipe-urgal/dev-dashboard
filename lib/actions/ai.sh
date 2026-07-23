#!/usr/bin/env bash
# ============================================================
# Ações de IA — abrem o Claude Code no diretório do projeto,
# com variações de sessão (nova/continuar/retomar) e prompts
# iniciais (slash command) que disparam skills específicas
# (code review, QA...).
# ============================================================

# Lança o Claude Code em "$path", com breadcrumb "$label" e os argumentos
# extras repassados direto pro comando "claude" (ex.: "--continue", "/code-review").
_dev_ai_launch() {
  local project="$1"
  local label="$2"
  shift 2
  local -a claude_args=("$@")

  local path
  path=$(project-path "$project") || path=""
  if [ -z "$path" ] || [ ! -d "$path" ]; then
    _dev_err "Caminho do projeto '$project' não encontrado."
    sleep 3
    return 1
  fi

  if ! _dev_has claude; then
    _dev_err "Claude Code (comando 'claude') não encontrado no PATH."
    echo "Instale em: https://docs.claude.com/en/docs/claude-code" >&2
    _dev_pause
    return 1
  fi

  _dev_clear
  _dev_breadcrumb "$path" "$project" "$label"
  echo >&2
  _dev_step "Abrindo Claude Code em '$project'..."
  _dev_step "Digite 'exit' ou pressione Ctrl+D para voltar ao dashboard."
  echo >&2

  local display_cmd="claude"
  [ ${#claude_args[@]} -gt 0 ] && display_cmd="claude ${claude_args[*]}"
  if _dev_has gum; then
    gum style --foreground "#6B7280" --italic "\$ $display_cmd" >&2
  else
    echo "\$ $display_cmd" >&2
  fi

  local old_dir
  old_dir=$(pwd)
  cd "$path" || { _dev_err "Não foi possível acessar $path"; sleep 3; return 1; }

  claude "${claude_args[@]}"
  local claude_exit=$?

  cd "$old_dir" >/dev/null 2>&1
  echo >&2

  if [ $claude_exit -eq 0 ]; then
    _dev_ok "Voltando ao dashboard..."
  else
    _dev_warn "Claude Code encerrado com código $claude_exit. De volta ao dashboard."
  fi
  sleep 2
}

# dev-claude — Abre uma sessão nova do Claude Code no diretório do projeto
dev-claude() {
  _dev_ai_launch "$1" "Assistente IA"
}

# dev-ai-continue — Continua a conversa mais recente neste diretório
dev-ai-continue() {
  _dev_ai_launch "$1" "Assistente IA — Continuar sessão" "--continue"
}

# dev-ai-resume — Abre o seletor de sessões anteriores do Claude Code
dev-ai-resume() {
  _dev_ai_launch "$1" "Assistente IA — Retomar sessão" "--resume"
}

# dev-ai-review — Abre o Claude Code já pedindo um code review do diff atual
dev-ai-review() {
  _dev_ai_launch "$1" "Code Review (IA)" "/code-review"
}

# dev-ai-qa — Abre o Claude Code já pedindo para testar (QA) as mudanças atuais
dev-ai-qa() {
  _dev_ai_launch "$1" "QA (IA)" "/verify"
}

# dev-ai-security — Abre o Claude Code já pedindo uma revisão de segurança das mudanças pendentes
dev-ai-security() {
  _dev_ai_launch "$1" "Segurança (IA)" "/security-review"
}

# dev-ai-simplify — Abre o Claude Code já pedindo uma limpeza de reuso/simplificação/eficiência
dev-ai-simplify() {
  _dev_ai_launch "$1" "Simplificar (IA)" "/simplify"
}

# dev-ai-menu — Submenu com as variações de sessão do Assistente IA
dev-ai-menu() {
  local project="$1"

  while true; do
    _dev_clear
    _dev_breadcrumb "Assistente IA"
    echo >&2
    _dev_step "Selecione como iniciar o Claude Code."
    echo >&2

    local -a options=("Nova sessão" "Continuar última sessão" "Retomar sessão específica" "Voltar")
    local -a descriptions=(
      "Inicia uma sessão nova do zero"
      "Continua a conversa mais recente neste diretório (--continue)"
      "Abre o seletor de sessões anteriores para escolher (--resume)"
      "Voltar ao menu do projeto"
    )

    local selected=""
    if _dev_has gum; then
      local rows="Ação;Descrição\n"
      local i
      for i in "${!options[@]}"; do
        rows+="${options[$i]};${descriptions[$i]}\n"
      done
      selected=$(printf "%b" "$rows" | gum table \
        --separator=";" \
        --border="rounded" \
        --border.foreground="#7C3AED" \
        --header.foreground="#7C3AED")
      [ -n "$selected" ] && selected=$(echo "$selected" | cut -d';' -f1 | xargs)
    else
      local j
      for j in "${!options[@]}"; do
        echo "  $((j+1))) ${options[$j]} - ${descriptions[$j]}" >&2
      done
      read -r -p "Número: " choice
      if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#options[@]} ]; then
        selected="${options[$((choice-1))]}"
      fi
    fi

    case "$selected" in
      "Nova sessão")               dev-claude "$project" ;;
      "Continuar última sessão")   dev-ai-continue "$project" ;;
      "Retomar sessão específica") dev-ai-resume "$project" ;;
      *) return 0 ;;
    esac
  done
}
