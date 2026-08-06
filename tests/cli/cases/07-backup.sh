#!/usr/bin/env bash
# Testa lib/backup/helpers.sh e lib/backup/run.sh (dev-backup / dev-restore)
source "$DEV_DASHBOARD_DIR/lib/core/checks.sh"
source "$DEV_DASHBOARD_DIR/lib/core/logging.sh"
source "$DEV_DASHBOARD_DIR/lib/backup/helpers.sh"
source "$DEV_DASHBOARD_DIR/lib/backup/run.sh"

fixture_root=$(mktemp -d)
config_dir="$fixture_root/config"
state_dir="$fixture_root/state"
backup_dir="$fixture_root/backups"
fake_home="$fixture_root/home"

orig_config_dir="${DEV_DASHBOARD_CONFIG_DIR:-}"
orig_state_dir="${DEV_DASHBOARD_STATE_DIR:-}"
orig_backup_dir="${DEV_DASHBOARD_BACKUP_DIR:-}"
orig_home="$HOME"

export DEV_DASHBOARD_CONFIG_DIR="$config_dir"
export DEV_DASHBOARD_STATE_DIR="$state_dir"
export DEV_DASHBOARD_BACKUP_DIR="$backup_dir"
export HOME="$fake_home"
mkdir -p "$fake_home"

# --- helpers respeitam as variáveis de ambiente ---
value=$(_backup_config_dir)
assert_eq "$config_dir" "$value" "_backup_config_dir respeita DEV_DASHBOARD_CONFIG_DIR"

value=$(_backup_state_dir)
assert_eq "$state_dir" "$value" "_backup_state_dir respeita DEV_DASHBOARD_STATE_DIR"

value=$(_backup_default_dir)
assert_eq "$backup_dir" "$value" "_backup_default_dir respeita DEV_DASHBOARD_BACKUP_DIR"

# --- dev-backup sem nenhum estado local: falha, sem criar arquivo ---
dev-backup >/tmp/dev-backup-output-$$ 2>&1
assert_failure $? "dev-backup falha quando não há nenhum estado local"
rm -f /tmp/dev-backup-output-$$

# --- popula estado local fake ---
mkdir -p "$config_dir" "$state_dir/tests-history"
echo '{"version":1,"workspaces":[]}' > "$config_dir/config.json"
echo 'token-secreto-nao-deve-ir-no-backup' > "$config_dir/api-token"
echo '{"version":1,"items":[]}' > "$state_dir/tests-history/p1.json"

dev-backup >/dev/null 2>&1
assert_success $? "dev-backup cria o arquivo com config+state presentes"

archive=$(ls "$backup_dir"/dev-dashboard-backup-*.tar.gz 2>/dev/null | head -n1)
[ -n "$archive" ]
assert_success $? "dev-backup grava um .tar.gz em DEV_DASHBOARD_BACKUP_DIR"

# --- o token da API não deve estar no arquivo ---
tar -tzf "$archive" 2>/dev/null | grep -q "config/api-token"
assert_failure $? "dev-backup nunca inclui o token da API no arquivo"

tar -tzf "$archive" 2>/dev/null | grep -q "config/config.json"
assert_success $? "dev-backup inclui config.json"

tar -tzf "$archive" 2>/dev/null | grep -q "state/tests-history/p1.json"
assert_success $? "dev-backup inclui o diretório de estado"

# --- dev-restore sem argumento falha ---
dev-restore >/tmp/dev-restore-output-$$ 2>&1
assert_failure $? "dev-restore sem argumento falha"
rm -f /tmp/dev-restore-output-$$

# --- dev-restore recusando a confirmação não altera nada ---
rm -rf "$config_dir" "$state_dir"
echo "n" | dev-restore "$archive" >/dev/null 2>&1
[ ! -d "$config_dir" ]
assert_success $? "dev-restore não escreve nada quando a confirmação é recusada"

# --- dev-restore confirmando restaura config e state ---
echo "s" | dev-restore "$archive" >/dev/null 2>&1
assert_success $? "dev-restore confirmado retorna sucesso"

[ -f "$config_dir/config.json" ]
assert_success $? "dev-restore recria config.json"

[ ! -f "$config_dir/api-token" ]
assert_success $? "dev-restore nunca recria o api-token (não estava no backup)"

[ -f "$state_dir/tests-history/p1.json" ]
assert_success $? "dev-restore recria o diretório de estado"

# --- dev-restore com arquivo que não é um backup válido ---
bogus_archive="$fixture_root/nao-e-um-backup.tar.gz"
tar -czf "$bogus_archive" -C "$fixture_root" home 2>/dev/null
echo "s" | dev-restore "$bogus_archive" >/tmp/dev-restore-bogus-$$ 2>&1
assert_failure $? "dev-restore rejeita um .tar.gz que não é um backup do Dev Dashboard"
rm -f /tmp/dev-restore-bogus-$$

# --- --include-secrets inclui ~/.dev-dashboard.secrets ---
echo 'export MEU_SEGREDO=1' > "$fake_home/.dev-dashboard.secrets"
dev-backup --include-secrets >/dev/null 2>&1
secrets_archive=$(ls -t "$backup_dir"/dev-dashboard-backup-*.tar.gz 2>/dev/null | head -n1)
tar -tzf "$secrets_archive" 2>/dev/null | grep -q "dev-dashboard.secrets"
assert_success $? "dev-backup --include-secrets inclui ~/.dev-dashboard.secrets"

dev-backup >/dev/null 2>&1
no_secrets_archive=$(ls -t "$backup_dir"/dev-dashboard-backup-*.tar.gz 2>/dev/null | head -n1)
tar -tzf "$no_secrets_archive" 2>/dev/null | grep -q "dev-dashboard.secrets"
assert_failure $? "dev-backup sem a flag não inclui ~/.dev-dashboard.secrets"

rm -rf "$fixture_root"
export DEV_DASHBOARD_CONFIG_DIR="$orig_config_dir"
export DEV_DASHBOARD_STATE_DIR="$orig_state_dir"
export DEV_DASHBOARD_BACKUP_DIR="$orig_backup_dir"
export HOME="$orig_home"
