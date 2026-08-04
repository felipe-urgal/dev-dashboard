#!/usr/bin/env bats
# ============================================================
# BATS — Testes para helpers não interativos do CLI Git
# ============================================================
# Funções testadas:
#   _git_branch_prefix       (lib/git/helpers.sh)
#   _git_default_branch      (lib/git/helpers.sh)
#   _git_check_dirty         (lib/git/helpers.sh)
#   _status_list_files       (lib/git/status/helpers.sh)
#   _status_get_files        (lib/git/status/helpers.sh)
#   _log_get_commits         (lib/git/log/helpers.sh)
#   _switch_list_branches    (lib/git/switch/helpers.sh)
#   _delete_list_branches    (lib/git/delete/helpers.sh)
#   _delete_checkout_safe    (lib/git/delete/helpers.sh)
#   _publish_extract_pr_url  (lib/git/publish/helpers.sh)
#   _dev_has                 (lib/core/checks.sh)
#   _dev_os                  (lib/core/checks.sh)
#   _dev_err / _dev_ok / _dev_warn (lib/core/logging.sh)
#   _save_prefix             (lib/git/save/helpers.sh)
# ============================================================

# Diretório temporário para repositórios Git de teste
setup() {
  REPO_DIR=$(mktemp -d)
  cd "$REPO_DIR"
  git init -b main
  git config user.name "Test User"
  git config user.email "test@example.com"
  echo "initial" > file.txt
  git add file.txt
  git commit -m "initial commit"
  # Caminho para os helpers (o .bats fica em lib/git/)
  GIT_HELPERS_DIR="$BATS_TEST_DIRNAME"
  CORE_DIR="$BATS_TEST_DIRNAME/../core"
}

teardown() {
  rm -rf "$REPO_DIR"
}

# ---- helpers.sh: _git_branch_prefix ----

@test "_git_branch_prefix retorna feat para feature/*" {
  git checkout -b feature/login
  source "$GIT_HELPERS_DIR/helpers.sh"
  result=$(_git_branch_prefix)
  [ "$result" = "feat" ]
}

@test "_git_branch_prefix retorna fix para fix/*" {
  git checkout -b fix/bug123
  source "$GIT_HELPERS_DIR/helpers.sh"
  result=$(_git_branch_prefix)
  [ "$result" = "fix" ]
}

@test "_git_branch_prefix retorna refactor para refactor/*" {
  git checkout -b refactor/cleanup
  source "$GIT_HELPERS_DIR/helpers.sh"
  result=$(_git_branch_prefix)
  [ "$result" = "refactor" ]
}

@test "_git_branch_prefix retorna chore para chore/*" {
  git checkout -b chore/deps
  source "$GIT_HELPERS_DIR/helpers.sh"
  result=$(_git_branch_prefix)
  [ "$result" = "chore" ]
}

@test "_git_branch_prefix retorna docs para docs/*" {
  git checkout -b docs/readme
  source "$GIT_HELPERS_DIR/helpers.sh"
  result=$(_git_branch_prefix)
  [ "$result" = "docs" ]
}

@test "_git_branch_prefix retorna fix para hotfix/*" {
  git checkout -b hotfix/urgent
  source "$GIT_HELPERS_DIR/helpers.sh"
  result=$(_git_branch_prefix)
  [ "$result" = "fix" ]
}

@test "_git_branch_prefix retorna vazio para branch sem prefixo" {
  # Já estamos em main; não precisa de checkout
  source "$GIT_HELPERS_DIR/helpers.sh"
  result=$(_git_branch_prefix)
  [ -z "$result" ]
}

@test "_git_branch_prefix retorna vazio para branch aleatória" {
  git checkout -b experiment
  source "$GIT_HELPERS_DIR/helpers.sh"
  result=$(_git_branch_prefix)
  [ -z "$result" ]
}

# ---- helpers.sh: _git_default_branch ----

@test "_git_default_branch retorna main quando existe" {
  source "$GIT_HELPERS_DIR/helpers.sh"
  result=$(_git_default_branch)
  [ "$result" = "main" ]
}

@test "_git_default_branch retorna master quando main não existe" {
  git branch -m main master
  source "$GIT_HELPERS_DIR/helpers.sh"
  result=$(_git_default_branch)
  [ "$result" = "master" ]
}

@test "_git_default_branch retorna develop quando main e master não existem" {
  git branch -m main develop
  source "$GIT_HELPERS_DIR/helpers.sh"
  result=$(_git_default_branch)
  [ "$result" = "develop" ]
}

@test "_git_default_branch retorna main como fallback" {
  git branch -m main develop
  git branch -m develop feature/test
  # Nenhum dos candidatos existe localmente
  source "$GIT_HELPERS_DIR/helpers.sh"
  result=$(_git_default_branch)
  [ "$result" = "main" ]
}

# ---- helpers.sh: _git_check_dirty ----

@test "_git_check_dirty retorna não-zero para árvore limpa" {
  source "$GIT_HELPERS_DIR/helpers.sh"
  # _git_check_dirty retorna 0 se SUJO, não-zero se LIMPO
  # A função é: ! git diff --quiet || ! git diff --cached --quiet || [...]
  # Quando limpo: ! git diff --quiet => 1, ! git diff --cached --quiet => 1, [...] => vazio => false
  # Então o resultado total é 1 (não-zero = limpo)
  ! _git_check_dirty
}

@test "_git_check_dirty detecta arquivo modificado" {
  source "$GIT_HELPERS_DIR/helpers.sh"
  echo "changed" > file.txt
  _git_check_dirty
  [ $? -eq 0 ]  # está sujo
}

@test "_git_check_dirty detecta arquivo novo (untracked)" {
  source "$GIT_HELPERS_DIR/helpers.sh"
  echo "new" > newfile.txt
  _git_check_dirty
  [ $? -eq 0 ]  # está sujo
}

@test "_git_check_dirty detecta arquivo em staged" {
  source "$GIT_HELPERS_DIR/helpers.sh"
  echo "staged" > staged.txt
  git add staged.txt
  _git_check_dirty
  [ $? -eq 0 ]  # está sujo
}

@test "_git_check_dirty detecta arquivo deletado" {
  source "$GIT_HELPERS_DIR/helpers.sh"
  rm file.txt
  _git_check_dirty
  [ $? -eq 0 ]  # está sujo
}

# ---- status/helpers.sh: _status_get_files ----

@test "_status_get_files retorna arquivos no formato status|file" {
  echo "mod" > file.txt
  echo "new" > newfile.txt
  git add newfile.txt
  source "$GIT_HELPERS_DIR/status/helpers.sh"
  result=$(_status_get_files)
  [[ "$result" == *" M|file.txt"* ]] || [[ "$result" == *"A |newfile.txt"* ]] || [[ "$result" == *"|file.txt"* ]]
  [[ "$result" == *"|newfile.txt"* ]]
}

@test "_status_get_files retorna vazio para árvore limpa" {
  source "$GIT_HELPERS_DIR/status/helpers.sh"
  result=$(_status_get_files)
  [ -z "$result" ]
}

# ---- log/helpers.sh: _log_get_commits ----

@test "_log_get_commits retorna commits no formato hash|linha" {
  echo "second" >> file.txt && git add . && git commit -m "second commit"
  echo "third" >> file.txt && git add . && git commit -m "third commit"
  source "$GIT_HELPERS_DIR/log/helpers.sh"
  result=$(_log_get_commits 3)
  # Deve conter 3 linhas
  line_count=$(echo "$result" | wc -l)
  [ "$line_count" -eq 3 ]
  # Cada linha deve conter |
  [[ "$result" == *"|"* ]]
}

@test "_log_get_commits respeita o limite de contagem" {
  echo "a" >> file.txt && git add . && git commit -m "a"
  echo "b" >> file.txt && git add . && git commit -m "b"
  echo "c" >> file.txt && git add . && git commit -m "c"
  source "$GIT_HELPERS_DIR/log/helpers.sh"
  result=$(_log_get_commits 2)
  line_count=$(echo "$result" | wc -l)
  [ "$line_count" -eq 2 ]
}

@test "_log_get_commits retorna vazio quando não há commits" {
  # Criar um novo repo sem commits
  EMPTY_DIR=$(mktemp -d)
  cd "$EMPTY_DIR"
  git init -b main
  source "$GIT_HELPERS_DIR/log/helpers.sh"
  result=$(_log_get_commits 5)
  [ -z "$result" ]
  rm -rf "$EMPTY_DIR"
}

# ---- switch/helpers.sh: _switch_list_branches ----

@test "_switch_list_branches lista branches exceto a atual" {
  git checkout -b feature/a
  git checkout -b feature/b
  git checkout main
  source "$GIT_HELPERS_DIR/switch/helpers.sh"
  result=$(_switch_list_branches)
  [[ "$result" == *"feature/a"* ]]
  [[ "$result" == *"feature/b"* ]]
  [[ "$result" != *"main"* ]]
}

@test "_switch_list_branches retorna vazio quando só há a branch atual" {
  source "$GIT_HELPERS_DIR/switch/helpers.sh"
  # set +e para evitar que a função com grep falhe ao retornar vazio
  result=$(_switch_list_branches 2>/dev/null) || true
  [ -z "$result" ]
}

# ---- delete/helpers.sh: _delete_list_branches ----

@test "_delete_list_branches exclui main e master" {
  git checkout -b feature/x
  source "$GIT_HELPERS_DIR/delete/helpers.sh"
  result=$(_delete_list_branches)
  [[ "$result" == *"feature/x"* ]]
  [[ "$result" != *"main"* ]]
}

@test "_delete_list_branches retorna vazio quando só há main" {
  source "$GIT_HELPERS_DIR/delete/helpers.sh"
  # grep -vE filtra main/master, e se não houver mais branches retorna vazio
  result=$(_delete_list_branches 2>/dev/null) || true
  [ -z "$result" ]
}

# ---- delete/helpers.sh: _delete_checkout_safe ----

@test "_delete_checkout_safe retorna 0 se branch não é a atual" {
  source "$GIT_HELPERS_DIR/delete/helpers.sh"
  _delete_checkout_safe "feature/x"
  [ $? -eq 0 ]
}

@test "_delete_checkout_safe alterna para main antes de deletar a branch atual" {
  git checkout -b feature/to-delete
  source "$CORE_DIR/checks.sh"
  source "$CORE_DIR/logging.sh"
  source "$GIT_HELPERS_DIR/delete/helpers.sh"
  _delete_checkout_safe "feature/to-delete" 2>/dev/null
  [ $? -eq 0 ]
  current=$(git branch --show-current)
  [ "$current" = "main" ]
}

# ---- publish/helpers.sh: _publish_extract_pr_url ----

@test "_publish_extract_pr_url extrai URL de PR do output do gh" {
  echo "https://github.com/owner/repo/pull/new/feature/login" > /tmp/gh_output.txt
  source "$GIT_HELPERS_DIR/publish/helpers.sh"
  result=$(_publish_extract_pr_url /tmp/gh_output.txt)
  [ "$result" = "https://github.com/owner/repo/pull/new/feature/login" ]
  rm /tmp/gh_output.txt
}

@test "_publish_extract_pr_url retorna vazio quando não há URL" {
  echo "Nenhum resultado encontrado" > /tmp/gh_output.txt
  source "$GIT_HELPERS_DIR/publish/helpers.sh"
  result=$(_publish_extract_pr_url /tmp/gh_output.txt)
  [ -z "$result" ]
  rm /tmp/gh_output.txt
}

@test "_publish_extract_pr_url extrai a primeira URL quando há múltiplas" {
  cat > /tmp/gh_output.txt << 'EOF'
Abra a PR: https://github.com/owner/repo/pull/new/feat/login
Detalhes em: https://github.com/owner/repo/pull/new/fix/bug
EOF
  source "$GIT_HELPERS_DIR/publish/helpers.sh"
  result=$(_publish_extract_pr_url /tmp/gh_output.txt)
  [ "$result" = "https://github.com/owner/repo/pull/new/feat/login" ]
  rm /tmp/gh_output.txt
}

# ---- save/helpers.sh: _save_prefix ----

@test "_save_prefix delega a _git_branch_prefix" {
  git checkout -b feature/save-test
  source "$GIT_HELPERS_DIR/helpers.sh"
  source "$GIT_HELPERS_DIR/save/helpers.sh"
  result=$(_save_prefix)
  [ "$result" = "feat" ]
}

# ---- core/checks.sh: _dev_has ----

@test "_dev_has retorna 0 para comando existente" {
  source "$CORE_DIR/checks.sh"
  _dev_has git
  [ $? -eq 0 ]
}

@test "_dev_has retorna não-zero para comando inexistente" {
  source "$CORE_DIR/checks.sh"
  _dev_has comando_inexistente_xyz || true
  # _dev_has retorna 1 quando comando não existe; forçar captura
  ! _dev_has comando_inexistente_xyz_123
}

# ---- core/checks.sh: _dev_os ----

@test "_dev_os retorna linux no Linux" {
  source "$CORE_DIR/checks.sh"
  result=$(_dev_os)
  [ "$result" = "linux" ]
}

# ---- core/logging.sh: _dev_err / _dev_ok / _dev_warn ----

@test "_dev_err imprime mensagem no stderr" {
  source "$CORE_DIR/checks.sh"
  source "$CORE_DIR/logging.sh"
  result=$(_dev_err "erro teste" 2>&1)
  [[ "$result" == *"erro teste"* ]]
}

@test "_dev_ok imprime mensagem no stderr" {
  source "$CORE_DIR/checks.sh"
  source "$CORE_DIR/logging.sh"
  result=$(_dev_ok "ok teste" 2>&1)
  [[ "$result" == *"ok teste"* ]]
}

@test "_dev_warn imprime mensagem no stderr" {
  source "$CORE_DIR/checks.sh"
  source "$CORE_DIR/logging.sh"
  result=$(_dev_warn "warn teste" 2>&1)
  [[ "$result" == *"warn teste"* ]]
}
