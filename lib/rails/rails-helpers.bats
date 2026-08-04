#!/usr/bin/env bats
# ============================================================
# BATS — Testes para helpers não interativos: Sidekiq, Webpack,
#         Credenciais Rails e Server Core
# ============================================================
# Notas:
# - Bats 1.10 usa `set -euo pipefail` por padrão.
# - Usamos `set +e` localmente quando a função pode retornar 1.
# - Usamos `! function` para testar que a função retorna não-zero.
# ============================================================

setup() {
  RUN_DIR=$(mktemp -d)
  export DEV_RUN_DIR="$RUN_DIR"
  export DEV_DASHBOARD_DIR=""
  unset GUM_PATH
  CORE_DIR="$BATS_TEST_DIRNAME/../core"
  SERVER_CORE_DIR="$BATS_TEST_DIRNAME/../server/core"
}

teardown() {
  rm -rf "$RUN_DIR"
}

# ---- server/core/helpers.sh: _dev_project_id ----

@test "_dev_project_id converte maiúsculas para minúsculas" {
  source "$SERVER_CORE_DIR/helpers.sh"
  result=$(_dev_project_id "MyRailsApp")
  [ "$result" = "myrailsapp" ]
}

@test "_dev_project_id substitui caracteres especiais por hífens" {
  source "$SERVER_CORE_DIR/helpers.sh"
  result=$(_dev_project_id "my_rails_app")
  [ "$result" = "my-rails-app" ]
}

@test "_dev_project_id lida com string vazia" {
  source "$SERVER_CORE_DIR/helpers.sh"
  result=$(_dev_project_id "")
  [ "$result" = "" ]
}

@test "_dev_project_id lida com espaços" {
  source "$SERVER_CORE_DIR/helpers.sh"
  result=$(_dev_project_id "My Rails App")
  [ "$result" = "my-rails-app" ]
}

@test "_dev_project_id preserva números" {
  source "$SERVER_CORE_DIR/helpers.sh"
  result=$(_dev_project_id "app_v2.1")
  [ "$result" = "app-v2-1" ]
}

# ---- server/core/helpers.sh: _is_port_in_use ----

@test "_is_port_in_use retorna não-zero para porta não em uso" {
  source "$SERVER_CORE_DIR/helpers.sh"
  set +e
  _is_port_in_use 65535
  local rc=$?
  set -e
  [ "$rc" -ne 0 ]
}

# ---- server/core/helpers.sh: _dev_is_webpack_running ----

@test "_dev_is_webpack_running retorna não-zero quando não há PID" {
  source "$SERVER_CORE_DIR/helpers.sh"
  set +e
  _dev_is_webpack_running "myapp"
  local rc=$?
  set -e
  [ "$rc" -ne 0 ]
}

@test "_dev_is_webpack_running retorna 0 quando PID existe e processo está vivo" {
  source "$SERVER_CORE_DIR/helpers.sh"
  local id=$(_dev_project_id "myapp")
  echo $$ > "$DEV_RUN_DIR/webpack-${id}.pid"
  _dev_is_webpack_running "myapp"
  [ $? -eq 0 ]
}

@test "_dev_is_webpack_running retorna não-zero quando PID existe mas processo morreu" {
  source "$SERVER_CORE_DIR/helpers.sh"
  local id=$(_dev_project_id "myapp")
  echo 99999999 > "$DEV_RUN_DIR/webpack-${id}.pid"
  set +e
  _dev_is_webpack_running "myapp"
  local rc=$?
  set -e
  [ "$rc" -ne 0 ]
}

# ---- sidekiq/helpers.sh: _sidekiq_cmd ----

@test "_sidekiq_cmd retorna bin/sidekiq quando existe" {
  mkdir -p "$BATS_TEST_TMPDIR/mock_bin/bin"
  touch "$BATS_TEST_TMPDIR/mock_bin/bin/sidekiq"
  chmod +x "$BATS_TEST_TMPDIR/mock_bin/bin/sidekiq"
  cd "$BATS_TEST_TMPDIR/mock_bin"
  source "$BATS_TEST_DIRNAME/sidekiq/helpers.sh"
  result=$(_sidekiq_cmd)
  [ "$result" = "bin/sidekiq" ]
}

@test "_sidekiq_cmd retorna bundle exec sidekiq quando bin não existe" {
  cd /tmp
  source "$BATS_TEST_DIRNAME/sidekiq/helpers.sh"
  result=$(_sidekiq_cmd)
  [ "$result" = "bundle exec sidekiq" ]
}

# ---- sidekiq/helpers.sh: _sidekiq_running ----

@test "_sidekiq_running retorna não-zero quando não há PID file" {
  source "$SERVER_CORE_DIR/helpers.sh"
  source "$BATS_TEST_DIRNAME/sidekiq/helpers.sh"
  set +e
  _sidekiq_running "myapp"
  local rc=$?
  set -e
  [ "$rc" -ne 0 ]
}

@test "_sidekiq_running retorna 0 quando PID existe e processo está vivo" {
  source "$SERVER_CORE_DIR/helpers.sh"
  source "$BATS_TEST_DIRNAME/sidekiq/helpers.sh"
  local id=$(_dev_project_id "myapp")
  echo $$ > "$DEV_RUN_DIR/sidekiq-${id}.pid"
  _sidekiq_running "myapp"
  [ $? -eq 0 ]
  [ "$_SIDEKIQ_PID" = "$$" ]
}

@test "_sidekiq_running retorna não-zero quando PID existe mas processo morreu" {
  source "$SERVER_CORE_DIR/helpers.sh"
  source "$BATS_TEST_DIRNAME/sidekiq/helpers.sh"
  local id=$(_dev_project_id "myapp")
  echo 99999999 > "$DEV_RUN_DIR/sidekiq-${id}.pid"
  set +e
  _sidekiq_running "myapp"
  local rc=$?
  set -e
  [ "$rc" -ne 0 ]
}

# ---- webpack/helpers.sh: _webpack_cmd ----

@test "_webpack_cmd retorna bin/webpack-dev-server quando existe" {
  mkdir -p "$BATS_TEST_TMPDIR/mock_webpack/bin"
  touch "$BATS_TEST_TMPDIR/mock_webpack/bin/webpack-dev-server"
  chmod +x "$BATS_TEST_TMPDIR/mock_webpack/bin/webpack-dev-server"
  cd "$BATS_TEST_TMPDIR/mock_webpack"
  source "$CORE_DIR/checks.sh"
  source "$BATS_TEST_DIRNAME/webpack/helpers.sh"
  result=$(_webpack_cmd)
  [ "$result" = "bin/webpack-dev-server" ]
}

@test "_webpack_cmd retorna npx webpack-dev-server quando npx existe e bin não existe" {
  mkdir -p "$BATS_TEST_TMPDIR/mock_webpack_npx"
  cd "$BATS_TEST_TMPDIR/mock_webpack_npx"
  echo '{"dependencies":{}}' > package.json
  source "$CORE_DIR/checks.sh"
  source "$BATS_TEST_DIRNAME/webpack/helpers.sh"
  result=$(_webpack_cmd)
  [ "$result" = "npx webpack-dev-server" ]
}

# ---- webpack/helpers.sh: _webpack_running ----

@test "_webpack_running retorna não-zero quando não há PID file" {
  source "$SERVER_CORE_DIR/helpers.sh"
  source "$BATS_TEST_DIRNAME/webpack/helpers.sh"
  set +e
  _webpack_running "myapp"
  local rc=$?
  set -e
  [ "$rc" -ne 0 ]
}

@test "_webpack_running retorna 0 quando PID existe e processo está vivo" {
  source "$SERVER_CORE_DIR/helpers.sh"
  source "$BATS_TEST_DIRNAME/webpack/helpers.sh"
  local id=$(_dev_project_id "myapp")
  echo $$ > "$DEV_RUN_DIR/webpack-${id}.pid"
  _webpack_running "myapp"
  [ $? -eq 0 ]
  [ "$_WEBPACK_PID" = "$$" ]
}

@test "_webpack_running retorna não-zero quando PID existe mas processo morreu" {
  source "$SERVER_CORE_DIR/helpers.sh"
  source "$BATS_TEST_DIRNAME/webpack/helpers.sh"
  local id=$(_dev_project_id "myapp")
  echo 99999999 > "$DEV_RUN_DIR/webpack-${id}.pid"
  set +e
  _webpack_running "myapp"
  local rc=$?
  set -e
  [ "$rc" -ne 0 ]
}

# ---- credentials/helpers.sh: _credentials_edit ----

@test "_credentials_edit não trava quando EDITOR não está setado" {
  source "$CORE_DIR/checks.sh"
  source "$CORE_DIR/logging.sh"
  source "$BATS_TEST_DIRNAME/credentials/helpers.sh"
  unset EDITOR
  # A função chama _dev_run_rails que não existe — esperamos falha controlada
  set +e
  _credentials_edit "development" 2>/dev/null
  local rc=$?
  set -e
  # rc != 0 é esperado porque _dev_run_rails não está definido
  [ "$rc" -ne 0 ]
}

# ---- server/core/commands.sh: dev-clean ----

@test "dev-clean remove PIDs órfãos" {
  source "$CORE_DIR/checks.sh"
  source "$CORE_DIR/logging.sh"
  # Mockar _dev_warn para evitar erros com set -e
  _dev_warn() { :; }
  source "$SERVER_CORE_DIR/commands.sh"
  echo 99999999 > "$DEV_RUN_DIR/orphan.pid"
  set +e
  dev-clean --quiet
  local rc=$?
  set -e
  [ "$rc" -eq 0 ]
  [ ! -f "$DEV_RUN_DIR/orphan.pid" ]
}

@test "dev-clean mantém PIDs de processos vivos" {
  source "$CORE_DIR/checks.sh"
  source "$CORE_DIR/logging.sh"
  _dev_warn() { :; }
  source "$SERVER_CORE_DIR/commands.sh"
  echo $$ > "$DEV_RUN_DIR/alive.pid"
  set +e
  dev-clean --quiet
  set -e
  [ -f "$DEV_RUN_DIR/alive.pid" ]
  rm -f "$DEV_RUN_DIR/alive.pid"
}

@test "dev-clean remove logs antigos além do período de retenção" {
  source "$CORE_DIR/checks.sh"
  source "$CORE_DIR/logging.sh"
  _dev_warn() { :; }
  source "$SERVER_CORE_DIR/commands.sh"
  echo "old log" > "$DEV_RUN_DIR/old.log"
  touch -d "10 days ago" "$DEV_RUN_DIR/old.log"
  export DEV_DASHBOARD_LOG_RETENTION_DAYS=7
  set +e
  dev-clean --quiet
  set -e
  [ ! -f "$DEV_RUN_DIR/old.log" ]
}

@test "dev-clean mantém logs recentes" {
  source "$CORE_DIR/checks.sh"
  source "$CORE_DIR/logging.sh"
  _dev_warn() { :; }
  source "$SERVER_CORE_DIR/commands.sh"
  echo "recent log" > "$DEV_RUN_DIR/recent.log"
  touch "$DEV_RUN_DIR/recent.log"
  export DEV_DASHBOARD_LOG_RETENTION_DAYS=7
  set +e
  dev-clean --quiet
  set -e
  [ -f "$DEV_RUN_DIR/recent.log" ]
  rm -f "$DEV_RUN_DIR/recent.log"
}

@test "dev-clean ignora logs que têm PID correspondente" {
  source "$CORE_DIR/checks.sh"
  source "$CORE_DIR/logging.sh"
  _dev_warn() { :; }
  source "$SERVER_CORE_DIR/commands.sh"
  # Criar PID de processo VIVO para proteger o log
  echo $$ > "$DEV_RUN_DIR/sidekiq-test.pid"
  echo "log content" > "$DEV_RUN_DIR/sidekiq-test.log"
  touch -d "10 days ago" "$DEV_RUN_DIR/sidekiq-test.log"
  export DEV_DASHBOARD_LOG_RETENTION_DAYS=7
  set +e
  dev-clean --quiet
  set -e
  # O log não deve ser removido porque o PID existe
  [ -f "$DEV_RUN_DIR/sidekiq-test.log" ]
  [ -f "$DEV_RUN_DIR/sidekiq-test.pid" ]
  rm -f "$DEV_RUN_DIR/sidekiq-test.pid" "$DEV_RUN_DIR/sidekiq-test.log"
}
