#!/usr/bin/env bash
# ============================================================
# FRAMEWORK — Asserções mínimas para os testes não interativos do CLI
# ============================================================
# Cada arquivo em tests/cli/cases/*.sh é executado (source) pelo run.sh, que
# zera _CLI_TEST_PASS/_CLI_TEST_FAIL antes e lê os totais depois. As funções
# abaixo só devem ser chamadas de dentro de um case file.

assert_eq() {
  local expected="$1" actual="$2" desc="${3:-assert_eq}"
  if [ "$expected" = "$actual" ]; then
    _CLI_TEST_PASS=$((_CLI_TEST_PASS + 1))
  else
    _CLI_TEST_FAIL=$((_CLI_TEST_FAIL + 1))
    echo "  FALHOU: $desc" >&2
    echo "    esperado: [$expected]" >&2
    echo "    obtido:   [$actual]" >&2
  fi
}

assert_success() {
  local code="$1" desc="${2:-assert_success}"
  if [ "$code" -eq 0 ]; then
    _CLI_TEST_PASS=$((_CLI_TEST_PASS + 1))
  else
    _CLI_TEST_FAIL=$((_CLI_TEST_FAIL + 1))
    echo "  FALHOU: $desc (esperava código 0, obteve $code)" >&2
  fi
}

assert_failure() {
  local code="$1" desc="${2:-assert_failure}"
  if [ "$code" -ne 0 ]; then
    _CLI_TEST_PASS=$((_CLI_TEST_PASS + 1))
  else
    _CLI_TEST_FAIL=$((_CLI_TEST_FAIL + 1))
    echo "  FALHOU: $desc (esperava código diferente de 0)" >&2
  fi
}

skip_case() {
  local desc="$1"
  echo "  IGNORADO: $desc" >&2
}
