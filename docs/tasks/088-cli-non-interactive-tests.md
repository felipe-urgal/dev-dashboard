# Task 088 — Suíte de testes para helpers não interativos do CLI bash

## Status

Concluída.

## Contexto

Executada em paralelo à task 087 (exportação segura de logs, dashboard web),
como atividade independente escolhida do inventário de `docs/PENDENCIAS.md`,
seção "CLI Bash": "criar uma suíte própria para helpers não interativos,
incluindo smoke de `git-*` e `_dev_*` puros". Não toca em `apps/`, `packages/`
nem nos painéis de log que a task 087 está alterando.

## Objetivo

O CLI bash (`lib/`) não tinha nenhum teste automatizado — verificar uma
mudança significava sempre rodar a função manualmente em um shell interativo.
Boa parte das funções são de fato interativas (menus, `gum`, `read -r -p`) e
continuam exigindo verificação manual, mas os helpers puros (`_dev_*`,
`_project_*`, `_git_*`, `_new_*` que não abrem prompt) podem ser cobertos por
asserts determinísticos.

## Decisão principal

Suíte própria em bash puro, sem framework externo (nada de `bats`), coerente
com o restante do CLI: sem build step, sem compilador, sem dependência nova.
Vive em `tests/cli/` na raiz do repositório — deliberadamente fora de `lib/`,
para não colidir com a convenção já existente de `lib/*/tests/`, que são
menus para rodar a suíte de testes *do projeto alvo* (ex. `bundle exec
rspec`), não testes deste codebase.

## Escopo

- `tests/cli/framework.sh` — `assert_eq`, `assert_success`, `assert_failure`,
  `skip_case`;
- `tests/cli/run.sh` — descobre `cases/*.sh`, isola diretório de trabalho por
  caso, soma totais, código de saída não-zero se algum assert falhar;
- `tests/cli/cases/`:
  - `01-core-checks.sh` — `_dev_has`, `_dev_os`;
  - `02-projects-helpers.sh` — `_project_get_field` (campo presente, ausente
    com/sem default, códigos de retorno) e `_project_detect_type` (Rails via
    `Gemfile`, Node via `package.json`, `unknown` sem nenhum dos dois), com
    projetos de exemplo em diretórios temporários;
  - `03-server-core-helpers.sh` — `_dev_project_id` (normalização de caixa,
    espaço, pontuação, underscore) e `_is_port_in_use` para uma porta livre,
    ignorado com aviso quando `lsof` não está disponível no ambiente;
  - `04-git-helpers.sh` — `_git_default_branch`, `_git_check_dirty` e
    `_git_branch_prefix` (feature/fix/hotfix/desconhecido), em um repositório
    Git temporário criado e descartado pelo próprio caso;
  - `05-git-new-helpers.sh` — `_new_sanitize_name` (espaços, pontuação,
    hífens/espaços nas bordas, caracteres não-ASCII) e `_new_branch_exists`,
    também em repositório temporário;
- `tests/cli/README.md` — como rodar, como escrever um novo caso, e a
  distinção explícita com `lib/*/tests/`;
- `CLAUDE.md` atualizado (seção "O que é isto" e fluxo de desenvolvimento do
  CLI) para referenciar a suíte nova.

## Critérios de aceite

- `tests/cli/run.sh` roda sem argumentos, sem instalar nada, e termina com
  código `0` quando todos os asserts passam;
- rodar a suíte duas vezes seguidas produz o mesmo resultado (sem estado
  residual em `/tmp`, sem side effect no repositório real);
- nenhum caso interativo (menu, `gum`, `read -r -p`) é coberto — isso
  continua fora do escopo, como já documentado em `CLAUDE.md`;
- um helper com dependência externa opcional (`_is_port_in_use` → `lsof`) não
  falha o ambiente que não a tem instalada, apenas registra "IGNORADO";
- nenhum arquivo dentro de `lib/` foi alterado.

## Testes automatizados

- os próprios 28 asserts de `tests/cli/cases/*.sh` (`tests/cli/run.sh`),
  cobrindo `_dev_has`, `_dev_os`, `_project_get_field`,
  `_project_detect_type`, `_dev_project_id`, `_is_port_in_use`,
  `_git_default_branch`, `_git_check_dirty`, `_git_branch_prefix`,
  `_new_sanitize_name` e `_new_branch_exists`.

## Roteiro de QA manual

- `bash tests/cli/run.sh` a partir da raiz do repo e a partir de outro
  diretório (`bash /caminho/absoluto/tests/cli/run.sh`) — mesmo resultado;
- remover `lsof` do `PATH` temporariamente (`PATH=/usr/bin:/bin` sem
  `/usr/sbin`, se aplicável) e confirmar que o caso correspondente é
  ignorado, não falha.

## Limitações

- não cobre nenhuma função interativa (menus, `dev-dashboard`, `git-save`
  completo, `dev-terminal`) — continuam exigindo verificação manual, como já
  descrito em `CLAUDE.md`;
- não roda em CI automaticamente ainda — o CLI não faz parte do workflow
  `.github/workflows/ci.yml` (que cobre só o monorepo web); adicionar isso é
  uma decisão separada, fora do escopo desta task;
- cobre cinco módulos de helpers (core, projects, server/core, git,
  git/new); os demais módulos (`rails/*`, `node/*`, `server/health`,
  `server/logs`, `git/stash`, `git/log`, etc.) ainda não têm caso — a
  convenção em `tests/cli/README.md` deixa claro como estendê-la
  incrementalmente.

## Arquivos alterados

- `tests/cli/framework.sh` (novo)
- `tests/cli/run.sh` (novo)
- `tests/cli/README.md` (novo)
- `tests/cli/cases/01-core-checks.sh` (novo)
- `tests/cli/cases/02-projects-helpers.sh` (novo)
- `tests/cli/cases/03-server-core-helpers.sh` (novo)
- `tests/cli/cases/04-git-helpers.sh` (novo)
- `tests/cli/cases/05-git-new-helpers.sh` (novo)
- `CLAUDE.md`
- `docs/PENDENCIAS.md`
- `docs/tasks/README.md`
