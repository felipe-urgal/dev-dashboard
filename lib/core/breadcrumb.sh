#!/usr/bin/env bash
# ============================================================
# Breadcrumb — Header de navegação visual (global)
# ============================================================
_dev_clear() {
  clear >&2 2>/dev/null || printf '\033c' >&2
}

# Monta "repo(branch)" ou "repo(branch - alterações não comitadas!)"
# a partir de um path específico (ou do diretório atual, se omitido).
_dev_repo_label() {
  local path="${1:-.}"
  if git -C "$path" rev-parse --is-inside-work-tree &>/dev/null; then
    local repo_name branch has_changes status_icon
    repo_name=$(basename "$(git -C "$path" rev-parse --show-toplevel 2>/dev/null)")
    branch=$(git -C "$path" branch --show-current 2>/dev/null)
    has_changes=$(git -C "$path" status --porcelain 2>/dev/null)
    status_icon=""
    [ -n "$has_changes" ] && status_icon=" - alterações não comitadas!"
    echo "${repo_name}(${branch}${status_icon})"
  else
    echo "dev-dashboard"
  fi
}

# Uso: _dev_breadcrumb [path] "Segmento1" "Segmento2" ...
# Se o primeiro argumento for um path válido de diretório, é usado
# para calcular o repo/branch. Caso contrário, todos os argumentos
# são tratados como segmentos e o path atual ($PWD) é usado.
_dev_breadcrumb() {
  local path="."
  local -a segments=("$@")

  if [ -d "${1:-}" ]; then
    path="$1"
    segments=("${@:2}")
  fi

  local repo_label
  repo_label=$(_dev_repo_label "$path")

  local -a parts=("$repo_label" "${segments[@]}")
  local total=${#parts[@]}
  local trail=""
  local i
  if _dev_has gum; then
    local separator
    separator=$(gum style --foreground "#6B7280" "›")
    for ((i = 0; i < total; i++)); do
      local segment="${parts[$i]}"
      local styled
      if [ $i -eq $((total - 1)) ]; then
        styled=$(gum style --foreground "#7C3AED" --bold "$segment")
      else
        styled=$(gum style --foreground "#6B7280" "$segment")
      fi
      if [ $i -eq 0 ]; then
        trail="$styled"
      else
        trail+=" ${separator} ${styled}"
      fi
    done
    local term_width
    term_width=$(tput cols 2>/dev/null || echo 80)
    local box_width=$((term_width - 6))
    gum style \
      --border rounded \
      --border-foreground "#7C3AED" \
      --padding "0 2" \
      --width "$box_width" \
      "$trail" >&2
  else
    trail="${parts[0]}"
    for ((i = 1; i < total; i++)); do
      trail+=" › ${parts[$i]}"
    done
    echo "$trail" >&2
  fi
}

_dev_step() {
  local text="$1"
  if _dev_has gum; then
    gum style --foreground "#A78BFA" --italic " ${text}" >&2
  else
    echo "${text}" >&2
  fi
}