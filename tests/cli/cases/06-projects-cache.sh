#!/usr/bin/env bash
# Testa lib/projects/cache.sh e a integração com detect_projects
source "$DEV_DASHBOARD_DIR/lib/core/checks.sh"
source "$DEV_DASHBOARD_DIR/lib/core/logging.sh"
source "$DEV_DASHBOARD_DIR/lib/projects/helpers.sh"
source "$DEV_DASHBOARD_DIR/lib/projects/config.sh"
source "$DEV_DASHBOARD_DIR/lib/projects/cache.sh"
source "$DEV_DASHBOARD_DIR/lib/projects/detect.sh"

workspace=$(mktemp -d)
fake_home=$(mktemp -d)
run_dir=$(mktemp -d)

orig_dev_base="${DEV_BASE:-}"
orig_home="$HOME"
orig_run_dir="${DEV_RUN_DIR:-}"

export DEV_BASE="$workspace"
export HOME="$fake_home"
export DEV_RUN_DIR="$run_dir"
declare -gA PROJECT_META=()
declare -gA PROJECT_CONFIG=()

mkdir -p "$workspace/app-node"
echo '{"name": "app-node"}' > "$workspace/app-node/package.json"

sig1="$(_detect_cache_signature)"
sig2="$(_detect_cache_signature)"
assert_eq "$sig1" "$sig2" "_detect_cache_signature é estável sem mudanças no workspace"

detect_projects
assert_eq "1" "${#PROJECT_META[@]}" "detect_projects encontra o único projeto na primeira varredura"

cache_file="$(_detect_cache_file)"
[ -f "$cache_file" ]
assert_success $? "detect_projects grava um arquivo de cache após varrer"

sentinela="path:$workspace/app-node|type:node|port:9999|mysql:no|webpack:no"
{
  head -n 1 "$cache_file"
  printf 'app-node\t%s\n' "$sentinela"
} > "$cache_file.tmp"
mv "$cache_file.tmp" "$cache_file"

declare -gA PROJECT_META=()
detect_projects
assert_eq "$sentinela" "${PROJECT_META[app-node]}" "detect_projects usa o cache quando a assinatura não mudou, em vez de revarrer"

mkdir -p "$workspace/app-rails"
cat > "$workspace/app-rails/Gemfile" <<'EOF'
gem "rails"
EOF

declare -gA PROJECT_META=()
detect_projects
assert_eq "2" "${#PROJECT_META[@]}" "adicionar um projeto muda a assinatura e força uma nova varredura"

real_meta="${PROJECT_META[app-node]}"
case "$real_meta" in
  *port:9999*)
    assert_eq "revarrido" "sentinela-ainda-presente" "a revarredura deveria substituir o valor sentinela do cache antigo"
    ;;
  *)
    assert_success 0 "a revarredura substitui o valor sentinela por um resultado real"
    ;;
esac

declare -gA PROJECT_META=()
detect_projects --force
assert_eq "2" "${#PROJECT_META[@]}" "detect_projects --force ignora o cache e revarre mesmo sem mudança de assinatura"

rm -rf "$workspace" "$fake_home" "$run_dir"
export DEV_BASE="$orig_dev_base"
export HOME="$orig_home"
export DEV_RUN_DIR="$orig_run_dir"
