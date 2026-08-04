#!/usr/bin/env bash
# Testa lib/git/new/helpers.sh — _new_sanitize_name, _new_branch_exists
source "$DEV_DASHBOARD_DIR/lib/git/new/helpers.sh"

value=$(_new_sanitize_name "Login Social!")
assert_eq "login-social" "$value" "_new_sanitize_name normaliza espaços e pontuação"

value=$(_new_sanitize_name "  --Exportar Logs--  ")
assert_eq "exportar-logs" "$value" "_new_sanitize_name remove hífens/espaços nas bordas e colapsa repetições"

value=$(_new_sanitize_name "já_com_ACENTOS")
assert_eq "j-com-acentos" "$value" "_new_sanitize_name trata caracteres não-ASCII como separador (fica a critério do chamador revisar)"

repo_dir=$(mktemp -d)
cd "$repo_dir" || exit 1

git init -q
git config user.email "dev-dashboard-tests@example.com"
git config user.name "dev-dashboard tests"
git checkout -q -b main
echo "conteudo" > arquivo.txt
git add arquivo.txt
git commit -q -m "commit inicial"

_new_branch_exists "main"
assert_success $? "_new_branch_exists reconhece a branch atual"

_new_branch_exists "feature/nao-existe"
assert_failure $? "_new_branch_exists não encontra uma branch inexistente"

git checkout -q -b feature/nao-existe
_new_branch_exists "feature/nao-existe"
assert_success $? "_new_branch_exists reconhece uma branch recém-criada"

cd - >/dev/null || exit 1
rm -rf "$repo_dir"
