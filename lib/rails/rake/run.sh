#!/usr/bin/env bash
# ============================================================
# Executar tarefa Rake (interativa)
# ============================================================
_rake_run_interactive() {
  local all_tasks
  all_tasks=$(_rake_list_all)
  if [ -z "$all_tasks" ]; then
    _dev_err "Nenhuma tarefa Rake encontrada. Execute bundle exec rake -T manualmente."
    sleep 3
    return 1
  fi

  local selected_line
  selected_line=$(_rake_select_task "$all_tasks")
  [ -z "$selected_line" ] && { _dev_warn "Cancelado."; sleep 3; return 1; }

  local task="${selected_line%%;*}"
  local description="${selected_line#*;}"
  task=$(echo "$task" | xargs)
  description=$(echo "$description" | xargs)

  _dev_ok "Tarefa selecionada: $task"
  echo "  $description" >&2

  local extra_args=""
  if _rake_needs_file "$description"; then
    local file
    file=$(_rake_ask_file)
    [ -n "$file" ] && extra_args="FILE=$file"
  fi

  local more_args
  more_args=$(_rake_ask_extra_args)
  if [ -n "$more_args" ]; then
    extra_args="$extra_args $more_args"
  fi

  _dev_spin "Executando bundle exec rake $task $extra_args..." bundle exec rake "$task" $extra_args
  sleep 3
}

_rake_run_manual() {
  local task=""
  if _dev_has gum; then
    task=$(gum input --header "Nome da tarefa Rake:" --placeholder "namespace:task")
  else
    read -r -p "Nome da tarefa Rake: " task
  fi
  [ -z "$task" ] && { _dev_warn "Cancelado."; sleep 3; return 1; }

  local args=""
  if _dev_has gum; then
    args=$(gum input --header "Argumentos (opcional):" --placeholder "FILE=caminho VAR=valor")
  else
    read -r -p "Argumentos (ex.: FILE=caminho): " args
  fi

  _dev_spin "Executando bundle exec rake $task $args..." bundle exec rake "$task" $args
  sleep 3
}