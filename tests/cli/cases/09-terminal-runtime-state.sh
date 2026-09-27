#!/usr/bin/env bash
# Regressões da #991: estado/lifecycle da TUI deve vir do Dashboard atual.

api_bridge="$DEV_DASHBOARD_DIR/lib/server/core/dashboard_api.sh"
commands_file="$DEV_DASHBOARD_DIR/lib/server/core/commands.sh"
start_file="$DEV_DASHBOARD_DIR/lib/server/core/start.sh"
menu_file="$DEV_DASHBOARD_DIR/lib/ui/menu.sh"
status_file="$DEV_DASHBOARD_DIR/lib/server/status/run.sh"
node_bridge="$DEV_DASHBOARD_DIR/scripts/terminal-dashboard-api.mjs"

if bash -n "$api_bridge" "$commands_file" "$start_file" "$menu_file" "$status_file" "$DEV_DASHBOARD_DIR/lib/dashboard/loop.sh"; then
  assert_success 0 "arquivos Bash do runtime canônico possuem sintaxe válida"
else
  assert_failure 0 "arquivos Bash do runtime canônico possuem sintaxe válida"
fi

if node --check "$node_bridge" >/dev/null 2>&1; then
  assert_success 0 "bridge Node da API possui sintaxe válida"
else
  assert_failure 0 "bridge Node da API possui sintaxe válida"
fi

source "$api_bridge"

assert_eq "🟢" "$(_dev_runtime_status_symbol running)" "running usa estado managed"
assert_eq "🟡" "$(_dev_runtime_status_symbol starting)" "starting é representado"
assert_eq "🔴" "$(_dev_runtime_status_symbol failed)" "failed é representado"
assert_eq "⚪" "$(_dev_runtime_status_symbol stopped)" "stopped é representado"
assert_eq "❔" "$(_dev_runtime_status_symbol unknown)" "unknown é representado"

if grep -q "/api/projects" "$node_bridge" &&
   grep -q "/process\\`" "$node_bridge" &&
   grep -q "/process/start" "$node_bridge" &&
   grep -q "/process/stop" "$node_bridge"; then
  assert_success 0 "bridge reutiliza projetos e lifecycle canônicos"
else
  assert_failure 0 "bridge deve reutilizar projetos e lifecycle canônicos"
fi

if grep -q "environmentInstanceId" "$node_bridge"; then
  assert_success 0 "Environment Instance é preservada no lifecycle"
else
  assert_failure 0 "lifecycle deve preservar Environment Instance"
fi

if grep -q "lsof -t -i" "$commands_file"; then
  assert_failure 0 "dev-stop não pode matar processo por ocupação de porta"
else
  assert_success 0 "dev-stop não usa porta como ownership"
fi

if grep -q "Matar processo na porta" "$start_file"; then
  assert_failure 0 "start fallback não deve propor kill de processo externo"
else
  assert_success 0 "start fallback falha fechado em porta externa"
fi

if grep -q "❔ unknown" "$menu_file" && grep -q "_dev_dashboard_snapshot" "$menu_file"; then
  assert_success 0 "home usa snapshot canônico e fallback unknown"
else
  assert_failure 0 "home deve usar snapshot canônico e fallback unknown"
fi
