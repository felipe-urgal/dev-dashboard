#!/usr/bin/env bash
# Regressão da #995: o dev-tools não deve reexpor ações legadas removidas.

menu_file="$DEV_DASHBOARD_DIR/lib/ui/menu.sh"
router_file="$DEV_DASHBOARD_DIR/lib/dashboard/router.sh"
actions_init="$DEV_DASHBOARD_DIR/lib/actions/init.sh"
editor_file="$DEV_DASHBOARD_DIR/lib/actions/editor.sh"

legacy_pattern='Assistente IA|Code Review \(IA\)|QA \(IA\)|Segurança \(IA\)|Simplificar \(IA\)|Abrir no Sublime|dev-ai-|dev-claude'

if grep -Eq "$legacy_pattern" "$menu_file" "$router_file" "$actions_init"; then
  assert_failure 0 "menu/router/loader não devem referenciar ações legadas"
else
  assert_success 0 "menu/router/loader não referenciam ações legadas"
fi

if [ -e "$DEV_DASHBOARD_DIR/lib/actions/ai.sh" ]; then
  assert_failure 0 "lib/actions/ai.sh deve ter sido removido"
else
  assert_success 0 "lib/actions/ai.sh foi removido"
fi

if grep -q 'Abrir no editor' "$menu_file" && grep -q 'dev-editor' "$router_file"; then
  assert_success 0 "menu usa ação genérica de editor"
else
  assert_failure 0 "menu deve rotear Abrir no editor para dev-editor"
fi

if grep -q '^dev-sublime()' "$editor_file" && grep -q 'dev-editor "$@"' "$editor_file"; then
  assert_success 0 "dev-sublime permanece alias de compatibilidade"
else
  assert_failure 0 "alias dev-sublime deve continuar compatível"
fi
