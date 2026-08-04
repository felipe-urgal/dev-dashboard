#!/usr/bin/env bash
# Testa lib/core/checks.sh — _dev_has, _dev_os
source "$DEV_DASHBOARD_DIR/lib/core/checks.sh"

_dev_has bash
assert_success $? "_dev_has reconhece um comando existente (bash)"

_dev_has __comando_que_nao_existe_123__
assert_failure $? "_dev_has recusa um comando inexistente"

os="$(_dev_os)"
assert_eq "linux" "$os" "_dev_os identifica Linux neste ambiente"
