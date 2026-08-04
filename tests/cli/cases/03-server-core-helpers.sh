#!/usr/bin/env bash
# Testa lib/server/core/helpers.sh — _dev_project_id, _is_port_in_use
source "$DEV_DASHBOARD_DIR/lib/server/core/helpers.sh"

value=$(_dev_project_id "My Project!")
assert_eq "my-project-" "$value" "_dev_project_id normaliza espaços e pontuação"

value=$(_dev_project_id "already-ok")
assert_eq "already-ok" "$value" "_dev_project_id preserva um id já normalizado"

value=$(_dev_project_id "API_v2")
assert_eq "api-v2" "$value" "_dev_project_id normaliza underscore e caixa alta"

if command -v lsof >/dev/null 2>&1; then
  free_port=65123
  _is_port_in_use "$free_port"
  assert_failure $? "_is_port_in_use retorna falha para uma porta livre ($free_port)"
else
  skip_case "_is_port_in_use — lsof indisponível neste ambiente"
fi
