#!/usr/bin/env bash
# ============================================================
# DEV DASHBOARD — Carregador principal
# ============================================================
# Instalação:
#   mkdir -p ~/.dev-dashboard
#   cp -r * ~/.dev-dashboard/
#   echo 'source ~/.dev-dashboard/init.sh' >> ~/.bashrc
# ============================================================
# Melhorias aplicadas:
#   - Diretório temporário por usuário (/tmp/dev-dashboard-$UID)
#   - Verificação de existência de módulos
#   - Proteção contra carregamento duplicado (DEV_LOADED)
#   - Modo silencioso (DEV_SILENT)
#   - Resolução de symlinks com pwd -P
#   - Carregamento opcional de submódulos com alerta
#   - Validação de funções antes de chamá-las
#   - Exportação condicional para Bash
#   - DEV_LOADED só é marcado após carregamento completo com sucesso
#   - Validação de funções-chave após carregar módulos obrigatórios
# ============================================================
# Convenção para novos submódulos:
#   Cada submódulo (git/*, rails/*, node/*, etc.) é responsável por
#   exportar suas próprias funções via `export -f` dentro do seu
#   próprio loader (ex.: lib/git/new/init.sh). A lista de export -f
#   na seção 9 deste arquivo cobre apenas as funções "core" do
#   dashboard, carregadas diretamente por este script.
# ============================================================

# -------------------------------------------------------------------
# 0. Proteção contra carregamento duplicado
# -------------------------------------------------------------------
if [[ -n "${DEV_LOADED:-}" ]]; then
    return 0
fi

# -------------------------------------------------------------------
# 1. Definição de diretórios base
# -------------------------------------------------------------------
export DEV_BASE="${DEV_BASE:-$HOME/Caiena/Projetos}"

# Diretório temporário por usuário (evita conflitos multiusuário)
export DEV_RUN_DIR="${TMPDIR:-/tmp}/dev-dashboard-${UID}"
mkdir -p "$DEV_RUN_DIR"
chmod 700 "$DEV_RUN_DIR"

# -------------------------------------------------------------------
# 2. Localização do script (resolvendo symlinks)
# -------------------------------------------------------------------
export DEV_DASHBOARD_DIR
DEV_DASHBOARD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

# -------------------------------------------------------------------
# 3. Função auxiliar para carregar módulos com verificação
# -------------------------------------------------------------------
_dev_source() {
    local file="$1"
    local required="${2:-true}"   # true = erro se ausente; false = apenas aviso
    if [[ -f "$file" ]]; then
        source "$file"
    else
        if $required; then
            echo "Dev Dashboard: módulo obrigatório ausente — $file" >&2
            return 1
        else
            echo "Dev Dashboard: módulo opcional não encontrado — $file" >&2
        fi
    fi
}

# Verifica se uma função obrigatória foi de fato definida após o source.
# Uso: _dev_require_function "nome_da_funcao" "nome do módulo (para a mensagem de erro)"
_dev_require_function() {
    local fn="$1"
    local label="${2:-$fn}"
    if ! declare -f "$fn" &>/dev/null; then
        echo "Dev Dashboard: função obrigatória '$fn' não encontrada após carregar $label." >&2
        return 1
    fi
}

# -------------------------------------------------------------------
# 4. Módulos base (ordem importa: cada um depende do anterior)
# -------------------------------------------------------------------
_dev_source "$DEV_DASHBOARD_DIR/lib/core/init.sh" true       || return 1
_dev_require_function "_dev_has" "lib/core"                  || return 1
_dev_require_function "_dev_ok"  "lib/core"                  || return 1

_dev_source "$DEV_DASHBOARD_DIR/lib/projects/init.sh" true   || return 1

# -------------------------------------------------------------------
# 5. Servidores (core → status → logs)
# -------------------------------------------------------------------
_dev_source "$DEV_DASHBOARD_DIR/lib/server/init.sh" true || return 1

# -------------------------------------------------------------------
# 6. UI, ações e dashboard
# -------------------------------------------------------------------
_dev_source "$DEV_DASHBOARD_DIR/lib/ui/init.sh" true          || return 1
_dev_source "$DEV_DASHBOARD_DIR/lib/actions/init.sh" true     || return 1
_dev_source "$DEV_DASHBOARD_DIR/lib/dashboard/init.sh" true   || return 1
_dev_require_function "dev-dashboard" "lib/dashboard"         || return 1

_dev_source "$DEV_DASHBOARD_DIR/lib/doctor/init.sh" true      || return 1

# -------------------------------------------------------------------
# 7. Submódulos (opcionais – carregamos com aviso, mas não abortam)
# -------------------------------------------------------------------
_dev_source "$DEV_DASHBOARD_DIR/lib/git/init.sh" false
_dev_source "$DEV_DASHBOARD_DIR/lib/rails/init.sh" false
_dev_source "$DEV_DASHBOARD_DIR/lib/node/init.sh" false

# -------------------------------------------------------------------
# 8. Configuração e detecção de projetos
# -------------------------------------------------------------------
if declare -f load_project_config &>/dev/null; then
    load_project_config
else
    echo "Função 'load_project_config' não encontrada. Verifique projects.sh." >&2
    return 1
fi

if declare -f detect_projects &>/dev/null; then
    # TODO: implementar cache de detecção (ex.: comparar timestamp do diretório base)
    # Se um cache existir e for recente, pular a detecção pesada.
    detect_projects
else
    echo "Função 'detect_projects' não encontrada. Verifique projects.sh." >&2
    return 1
fi

# -------------------------------------------------------------------
# 9. Exportação de funções principais (apenas no Bash)
# -------------------------------------------------------------------
if [[ -n "$BASH_VERSION" ]]; then
    export -f dev-tools dev-doctor dev-help dev-open dev-sublime dev-terminal \
           dev-status dev-status-all dev-stop dev-stop-all dev-kill-port \
           dev-servers dev-logs dev-clean dev-rails-menu dev-node-menu project-databases \
           dev-dashboard
fi

# -------------------------------------------------------------------
# 10. Marca o carregamento como concluído com sucesso
# -------------------------------------------------------------------
export DEV_LOADED=1

# -------------------------------------------------------------------
# 11. Mensagem de conclusão (silenciosa se DEV_SILENT estiver definida)
# -------------------------------------------------------------------
if [[ -z "${DEV_SILENT:-}" ]]; then
    echo "Dev Dashboard carregado! Use 'dev-tools' para iniciar."
fi