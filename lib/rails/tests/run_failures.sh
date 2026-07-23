#!/usr/bin/env bash
# ============================================================
# Reexecutar apenas os testes que falharam na última execução
# ============================================================
_tests_run_failures() {
  # --only-failures exige persistência de status configurada no RSpec
  if ! grep -rq "example_status_persistence_file_path" .rspec spec/spec_helper.rb 2>/dev/null; then
    _dev_warn "O projeto não tem persistência de status do RSpec configurada."
    echo "  Adicione ao spec/spec_helper.rb:" >&2
    echo "    config.example_status_persistence_file_path = \"tmp/rspec_examples.txt\"" >&2
    _dev_pause
    return 1
  fi

  local rspec_cmd="bundle exec rspec --only-failures --color --format progress"
  local start_time=$SECONDS

  if _dev_has gum; then
    gum spin --spinner dot --title "Reexecutando testes falhos..." --show-output -- bash -c "$rspec_cmd"
  else
    bash -c "$rspec_cmd"
  fi
  local exit_code=$?
  local elapsed=$((SECONDS - start_time))

  echo >&2
  if [ $exit_code -eq 0 ]; then
    _dev_ok "Todos os testes que haviam falhado agora passam (${elapsed}s)."
    sleep 3
  else
    _dev_err "Ainda há falhas após ${elapsed}s (código $exit_code)."
    _dev_pause
  fi
  return $exit_code
}
