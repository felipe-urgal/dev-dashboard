#!/usr/bin/env bash
# Testa lib/projects/helpers.sh e a detecção de tipo de lib/projects/detect.sh
source "$DEV_DASHBOARD_DIR/lib/projects/helpers.sh"
source "$DEV_DASHBOARD_DIR/lib/projects/detect.sh"

meta="path:/tmp/foo|type:rails|port:3001|mysql:yes|webpack:no"

value=$(_project_get_field "$meta" "type")
assert_eq "rails" "$value" "_project_get_field lê o campo 'type'"

value=$(_project_get_field "$meta" "port")
assert_eq "3001" "$value" "_project_get_field lê o campo 'port'"

value=$(_project_get_field "$meta" "inexistente" "padrao")
assert_eq "padrao" "$value" "_project_get_field retorna o default quando o campo não existe"

_project_get_field "$meta" "inexistente" >/dev/null
assert_failure $? "_project_get_field retorna código de erro quando o campo não existe"

_project_get_field "$meta" "type" >/dev/null
assert_success $? "_project_get_field retorna código de sucesso quando o campo existe"

tmp_dir=$(mktemp -d)

rails_dir="$tmp_dir/rails-app"
mkdir -p "$rails_dir"
cat > "$rails_dir/Gemfile" <<'EOF'
source "https://rubygems.org"
gem "rails", "~> 7.1"
EOF
value=$(_project_detect_type "$rails_dir")
assert_eq "rails" "$value" "_project_detect_type reconhece um projeto Rails pelo Gemfile"

node_dir="$tmp_dir/node-app"
mkdir -p "$node_dir"
echo '{"name": "node-app"}' > "$node_dir/package.json"
value=$(_project_detect_type "$node_dir")
assert_eq "node" "$value" "_project_detect_type reconhece um projeto Node pelo package.json"

unknown_dir="$tmp_dir/plain"
mkdir -p "$unknown_dir"
value=$(_project_detect_type "$unknown_dir")
assert_eq "unknown" "$value" "_project_detect_type retorna 'unknown' sem Gemfile/package.json"

rm -rf "$tmp_dir"
