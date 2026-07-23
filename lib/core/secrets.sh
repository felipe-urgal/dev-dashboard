#!/usr/bin/env bash
# ============================================================
# Segredos locais (carregados por último, opcionais)
# ============================================================
DEV_SECRETS_FILE="$HOME/.dev-dashboard.secrets"
if [ -f "$DEV_SECRETS_FILE" ]; then
  perms=$(stat -c "%a" "$DEV_SECRETS_FILE" 2>/dev/null || stat -f "%Lp" "$DEV_SECRETS_FILE" 2>/dev/null)
  if [ -n "$perms" ] && [ "$perms" != "600" ]; then
    chmod 600 "$DEV_SECRETS_FILE" 2>/dev/null && \
      echo "Dev Dashboard: permissões de $DEV_SECRETS_FILE corrigidas para 600." >&2 || \
      echo "Aviso: não foi possível corrigir as permissões de $DEV_SECRETS_FILE (atual: $perms, recomendado: 600)." >&2
  fi
  source "$DEV_SECRETS_FILE"
fi