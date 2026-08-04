#!/usr/bin/env bash
# ============================================================
# RUN — Executa a suíte de testes não interativos do CLI bash
# ============================================================
# Cobre helpers puros (_dev_*, _project_*, _git_*, _new_*) que não dependem
# de menu interativo. NÃO substitui `lib/*/tests/`, que são menus para rodar
# a suíte de testes do projeto alvo (ex. bundle exec rspec) — ver CLAUDE.md.
#
# Uso: tests/cli/run.sh

set -uo pipefail

CLI_TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DEV_DASHBOARD_DIR
DEV_DASHBOARD_DIR="$(cd "$CLI_TESTS_DIR/../.." && pwd)"

source "$CLI_TESTS_DIR/framework.sh"

total_pass=0
total_fail=0
failed_files=()

shopt -s nullglob
case_files=("$CLI_TESTS_DIR"/cases/*.sh)
shopt -u nullglob

if [ ${#case_files[@]} -eq 0 ]; then
  echo "Nenhum arquivo de teste encontrado em $CLI_TESTS_DIR/cases" >&2
  exit 1
fi

for case_file in "${case_files[@]}"; do
  _CLI_TEST_PASS=0
  _CLI_TEST_FAIL=0
  start_dir="$(pwd)"

  source "$case_file"

  cd "$start_dir" || exit 1

  name="$(basename "$case_file")"
  echo "$name: ${_CLI_TEST_PASS} ok, ${_CLI_TEST_FAIL} falhas"

  total_pass=$((total_pass + _CLI_TEST_PASS))
  total_fail=$((total_fail + _CLI_TEST_FAIL))
  [ "$_CLI_TEST_FAIL" -gt 0 ] && failed_files+=("$name")
done

echo
echo "Total: $total_pass ok, $total_fail falhas"

if [ "$total_fail" -gt 0 ]; then
  echo "Arquivos com falhas: ${failed_files[*]}"
  exit 1
fi

exit 0
