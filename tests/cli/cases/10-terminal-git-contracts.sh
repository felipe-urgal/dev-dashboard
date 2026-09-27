#!/usr/bin/env bash
# Regressões da #992: Git TUI deve usar os contratos atuais da API.

api_file="$DEV_DASHBOARD_DIR/lib/git/api.sh"
menu_file="$DEV_DASHBOARD_DIR/lib/git/menu/run.sh"
tools_file="$DEV_DASHBOARD_DIR/lib/git/tools/run.sh"
node_bridge="$DEV_DASHBOARD_DIR/scripts/terminal-git-api.mjs"
git_init="$DEV_DASHBOARD_DIR/lib/git/init.sh"

if bash -n "$api_file" "$menu_file" "$tools_file" "$git_init"; then
  assert_success 0 "Git TUI possui sintaxe Bash válida"
else
  assert_failure 0 "Git TUI possui sintaxe Bash válida"
fi

if node --check "$node_bridge" >/dev/null 2>&1; then
  assert_success 0 "bridge Git possui sintaxe Node válida"
else
  assert_failure 0 "bridge Git possui sintaxe Node válida"
fi

for legacy in "Publicar" "Atualizar main" "Stash"; do
  if grep -q ""$legacy"" "$menu_file"; then
    assert_failure 0 "ação obsoleta '$legacy' não deve existir no menu principal"
  else
    assert_success 0 "ação obsoleta '$legacy' removida do menu principal"
  fi
done

for contract in   "/git/workspace"   "/git/mutations/confirmations"   "/git/branches"   "/git/switch"   "/git/commit"   "/git/sync/confirmations"   "/git/pull-request/confirmations"   "/git/undo/confirmations"   "/git/diff?scope=combined"   "/git/exclusive-branch-commits"; do
  if grep -Fq "$contract" "$node_bridge"; then
    assert_success 0 "bridge usa contrato $contract"
  else
    assert_failure 0 "bridge deve usar contrato $contract"
  fi
done

if grep -q "confirmationToken" "$node_bridge"; then
  assert_success 0 "mutações usam tokens de confirmação"
else
  assert_failure 0 "mutações devem usar tokens de confirmação"
fi

if grep -q "_dev_dashboard_api_available" "$tools_file"; then
  assert_success 0 "Git TUI falha fechado sem API canônica"
else
  assert_failure 0 "Git TUI deve exigir API canônica"
fi

if grep -Eq 'git (checkout|switch|commit|push|pull|reset|revert|branch -[dD])' "$tools_file"; then
  assert_failure 0 "Git TUI não deve executar mutações Git diretamente"
else
  assert_success 0 "Git TUI não executa mutações Git diretamente"
fi
