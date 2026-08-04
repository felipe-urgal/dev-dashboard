#!/usr/bin/env bash
# Testa lib/git/helpers.sh — _git_branch_prefix, _git_default_branch, _git_check_dirty
source "$DEV_DASHBOARD_DIR/lib/git/helpers.sh"

repo_dir=$(mktemp -d)
cd "$repo_dir" || exit 1

git init -q
git config user.email "dev-dashboard-tests@example.com"
git config user.name "dev-dashboard tests"
git checkout -q -b main
echo "conteudo" > arquivo.txt
git add arquivo.txt
git commit -q -m "commit inicial"

value=$(_git_default_branch)
assert_eq "main" "$value" "_git_default_branch encontra 'main' sem remote configurado"

_git_check_dirty
assert_failure $? "_git_check_dirty não acusa sujeira em árvore limpa"

echo "novo" > outro.txt
_git_check_dirty
assert_success $? "_git_check_dirty acusa arquivo não rastreado"
rm -f outro.txt

git checkout -q -b feature/exportar-logs
value=$(_git_branch_prefix)
assert_eq "feat" "$value" "_git_branch_prefix mapeia branch feature/* para 'feat'"

git checkout -q -b fix/corrige-token
value=$(_git_branch_prefix)
assert_eq "fix" "$value" "_git_branch_prefix mapeia branch fix/* para 'fix'"

git checkout -q -b hotfix/producao
value=$(_git_branch_prefix)
assert_eq "fix" "$value" "_git_branch_prefix mapeia branch hotfix/* para 'fix'"

git checkout -q -b sem-prefixo-reconhecido
value=$(_git_branch_prefix)
assert_eq "" "$value" "_git_branch_prefix retorna vazio para um tipo de branch desconhecido"

cd - >/dev/null || exit 1
rm -rf "$repo_dir"
