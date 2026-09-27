#!/usr/bin/env bash
# Regressões da #993: Rails/Node TUI deve usar runtime/Execution Context canônico.

runtime_api="$DEV_DASHBOARD_DIR/lib/runtime/api.sh"
runtime_bridge="$DEV_DASHBOARD_DIR/scripts/terminal-runtime-api.mjs"
rails_init="$DEV_DASHBOARD_DIR/lib/rails/init.sh"
rails_menu="$DEV_DASHBOARD_DIR/lib/rails/menu/run.sh"
node_init="$DEV_DASHBOARD_DIR/lib/node/init.sh"
node_menu="$DEV_DASHBOARD_DIR/lib/node/menu/run.sh"
terminal_action="$DEV_DASHBOARD_DIR/lib/actions/terminal.sh"

if bash -n "$runtime_api" "$rails_init" "$rails_menu" "$node_init" "$node_menu" "$terminal_action"; then
  assert_success 0 "runtime Rails/Node possui sintaxe Bash válida"
else
  assert_failure 0 "runtime Rails/Node possui sintaxe Bash válida"
fi

if node --check "$runtime_bridge" >/dev/null 2>&1; then
  assert_success 0 "bridge de runtime possui sintaxe Node válida"
else
  assert_failure 0 "bridge de runtime possui sintaxe Node válida"
fi

for contract in   "/terminal/${kind}/confirmations"   "/tests?refresh=true"   "/tests/${encodeURIComponent(commandId)}/start"   "/dependencies/pty/start"   "/migrations/mutations/plan"   "/migrations/mutations/confirmation"   "/migrations/mutations/start"   "/rails/workers/${encodeURIComponent(workerId)}"; do
  if grep -Fq "$contract" "$runtime_bridge"; then
    assert_success 0 "bridge usa contrato $contract"
  else
    assert_failure 0 "bridge deve usar contrato $contract"
  fi
done

if grep -q "environmentInstanceId" "$runtime_bridge" &&
   grep -q "planHash" "$runtime_bridge"; then
  assert_success 0 "migrations preservam Environment Instance e planHash"
else
  assert_failure 0 "migrations devem preservar Environment Instance e planHash"
fi

if grep -q "_runtime_terminal_supported" "$rails_menu" &&
   grep -q "_runtime_worker_detected" "$rails_menu"; then
  assert_success 0 "menu Rails esconde console/workers indisponíveis"
else
  assert_failure 0 "menu Rails deve refletir capabilities do runtime"
fi

for removed in "Banco" "Bundler" "Rotas" "Generators" "Assets" "Rake Tasks" "Credenciais" "Scripts" "Ferramentas"; do
  if grep -q ""$removed"" "$rails_menu" "$node_menu"; then
    assert_failure 0 "ação legado '$removed' não deve permanecer no menu atual"
  else
    assert_success 0 "ação legado '$removed' não é exibida"
  fi
done

for legacy_loader in database assets console generators server sidekiq webpack tests rake bundler routes credentials; do
  if grep -q "lib/rails/$legacy_loader" "$rails_init"; then
    assert_failure 0 "Rails não deve carregar módulo legado $legacy_loader"
  else
    assert_success 0 "Rails não carrega módulo legado $legacy_loader"
  fi
done

for legacy_loader in server tests deps scripts tools; do
  if grep -q "lib/node/$legacy_loader" "$node_init"; then
    assert_failure 0 "Node não deve carregar módulo legado $legacy_loader"
  else
    assert_success 0 "Node não carrega módulo legado $legacy_loader"
  fi
done

if grep -Eq '(^|[[:space:]])(bundle|rails|rspec|rake|npm|yarn|pnpm)[[:space:]]' "$rails_menu" "$node_menu"; then
  assert_failure 0 "menus Rails/Node não devem montar comandos arbitrários diretamente"
else
  assert_success 0 "menus Rails/Node não montam comandos de runtime diretamente"
fi

if grep -q "_runtime_api terminal-open" "$terminal_action" &&
   ! grep -q '"$SHELL"' "$terminal_action"; then
  assert_success 0 "Terminal usa PTY canônico em vez de shell local"
else
  assert_failure 0 "Terminal deve usar PTY canônico"
fi
