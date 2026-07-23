#!/usr/bin/env bash
# ============================================================
# NODE SCRIPTS HELPERS — Listagem e seleção de scripts
# ============================================================

# Lista os nomes dos scripts do package.json (um por linha).
_node_list_scripts() {
  [ -f "package.json" ] || return 1
  if _dev_has node; then
    node -e 'const s = require("./package.json").scripts || {}; Object.keys(s).forEach(k => console.log(k));' 2>/dev/null
  else
    # Fallback sem node: extrai o bloco "scripts" com sed/grep
    sed -n '/"scripts"[[:space:]]*:/,/}/p' package.json \
      | grep -oE '"[^"]+"[[:space:]]*:' \
      | sed 's/"scripts".*//; s/[":[:space:]]//g' \
      | sed '/^$/d'
  fi
}

_node_select_script() {
  local -a scripts
  readarray -t scripts < <(_node_list_scripts)
  [ ${#scripts[@]} -eq 0 ] && return 1

  if _dev_has gum; then
    printf '%s\n' "${scripts[@]}" | gum filter --placeholder "Digite para buscar um script..." --height 15
  else
    echo "Scripts disponíveis:" >&2
    local i=1
    local s
    for s in "${scripts[@]}"; do
      echo "  $i) $s" >&2
      ((i++))
    done
    read -r -p "Número do script (Enter para cancelar): " num
    if [[ "$num" =~ ^[0-9]+$ ]] && [ "$num" -ge 1 ] && [ "$num" -le ${#scripts[@]} ]; then
      echo "${scripts[$((num-1))]}"
    fi
  fi
}
