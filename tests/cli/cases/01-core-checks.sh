#!/usr/bin/env bash
# Testa lib/core/checks.sh — _dev_has, _dev_os
source "$DEV_DASHBOARD_DIR/lib/core/checks.sh"

_dev_has bash
assert_success $? "_dev_has reconhece um comando existente (bash)"

_dev_has __comando_que_nao_existe_123__
assert_failure $? "_dev_has recusa um comando inexistente"

os="$(_dev_os)"
assert_eq "linux" "$os" "_dev_os identifica Linux neste ambiente"

# _dev_os despacha por `uname -s` — os ramos mac/other não são alcançáveis
# neste runner (Linux), então testamos com um `uname` falso na frente do
# PATH (mesma técnica usada para simular ausência de dependências opcionais).
fake_uname_bin=$(mktemp -d)

cat > "$fake_uname_bin/uname" <<'EOF'
#!/usr/bin/env bash
echo "Darwin"
EOF
chmod +x "$fake_uname_bin/uname"
os="$(PATH="$fake_uname_bin:$PATH" _dev_os)"
assert_eq "mac" "$os" "_dev_os identifica macOS quando uname -s retorna Darwin"

cat > "$fake_uname_bin/uname" <<'EOF'
#!/usr/bin/env bash
echo "FreeBSD"
EOF
chmod +x "$fake_uname_bin/uname"
os="$(PATH="$fake_uname_bin:$PATH" _dev_os)"
assert_eq "other" "$os" "_dev_os cai em 'other' para sistemas não reconhecidos"

rm -rf "$fake_uname_bin"
