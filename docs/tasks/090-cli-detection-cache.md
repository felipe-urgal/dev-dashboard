# Task 090 — Cache da detecção inicial do CLI para workspaces grandes

## Status

Concluída.

## Contexto

Executada como frente paralela do inventário de `docs/PENDENCIAS.md`, seção
"CLI Bash": "criar cache da detecção inicial para workspaces grandes". Não
toca em `apps/`, `packages/`, nem em nenhum arquivo tocado pela task 089
(projetos recentes), que estava reservada como próxima entrega sequencial.

`init.sh` já continha o marcador explícito do que faltava:

```
# TODO: implementar cache de detecção (ex.: comparar timestamp do diretório base)
# Se um cache existir e for recente, pular a detecção pesada.
```

## Objetivo

`detect_projects` varre `DEV_BASE` e reabre `Gemfile`, `package.json` e
`database.yml` de cada projeto toda vez que um shell novo carrega o
dashboard (`init.sh` chama `detect_projects` incondicionalmente). Em um
workspace com muitos projetos, isso soma um custo de I/O por terminal aberto
que na maioria das vezes não muda nada de uma sessão para a outra.

## Decisão principal

Cache por assinatura de metadados, sem daemon nem TTL: `lib/projects/cache.sh`
computa uma assinatura combinando o mtime de `DEV_BASE`, do arquivo de
overrides (`~/.dev-dashboard/config/projects.conf`) e de cada diretório de
projeto de primeiro nível — incluindo o `config/` de projetos Rails, onde
vivem `database.yml` e `webpack/`. mtime de diretório muda quando um filho
direto é criado, removido ou renomeado, então a assinatura já cobre
`Gemfile`/`package.json` aparecendo ou sumindo sem reabrir cada arquivo para
comparar conteúdo.

Se a assinatura bate com a gravada no cache anterior, `detect_projects`
reidrata `PROJECT_META` direto do cache e pula a varredura. Caso contrário
(ou com `detect_projects --force`), varre normalmente e regrava o cache.

O corpo original de `detect_projects` virou `_detect_projects_scan` (privada);
`detect_projects` passou a ser só o roteamento cache-ou-varredura.

## Escopo

- `lib/projects/cache.sh` (novo): `_detect_cache_file`, `_detect_mtime`,
  `_detect_cache_signature`, `_detect_cache_write`, `_detect_cache_read`;
- `lib/projects/detect.sh`: extrai `_detect_projects_scan`, `detect_projects`
  vira wrapper com cache e aceita `--force`;
- `lib/projects/init.sh`: carrega `cache.sh` antes de `detect.sh`;
- `init.sh`: remove o TODO, já resolvido;
- corrige um bug latente encontrado ao automatizar o teste: acesso a chave
  ausente de `PROJECT_CONFIG` (array associativo) sem `:-` estourava
  `unbound variable` sob `set -u` — inofensivo interativamente (o dashboard
  não roda com `set -u`), mas quebrava a primeira chamada automatizada de
  `detect_projects`;
- `tests/cli/cases/06-projects-cache.sh` (novo): assinatura estável sem
  mudanças, cache usado quando nada muda (via valor sentinela gravado direto
  no arquivo de cache), invalidação ao adicionar projeto, e `--force`
  ignorando um cache válido;
- `tests/cli/README.md`, `docs/tasks/README.md`, `docs/tasks/PARALLEL-WORK.md`
  e `docs/PENDENCIAS.md` atualizados.

## Critérios de aceite

- `detect_projects` sem mudanças no workspace não reabre
  `Gemfile`/`package.json`/`database.yml` — usa o cache;
- adicionar, remover ou trocar o tipo de um projeto (mtime do diretório muda)
  invalida o cache automaticamente na chamada seguinte;
- mudar `~/.dev-dashboard/config/projects.conf` invalida o cache;
- `detect_projects --force` sempre revarre, mesmo com cache válido;
- `DEV_BASE` inexistente continua avisando e retornando falha, sem gravar
  cache;
- workspace sem nenhum projeto reconhecido também é cacheável (cache "vazio"
  válido);
- nenhuma mudança de comportamento visível para quem já usa o dashboard sem
  cache anterior (primeira chamada sempre varre).

## Testes automatizados

- `tests/cli/run.sh` — 35 asserts (28 anteriores + 7 novos de
  `06-projects-cache.sh`), 0 falhas.

## Roteiro de QA manual

```bash
source ~/.dev-dashboard/init.sh   # 1ª carga: varre e grava cache
source ~/.dev-dashboard/init.sh   # 2ª carga (shell novo): usa cache
touch "$DEV_BASE/algum-projeto"   # muda mtime do projeto
source ~/.dev-dashboard/init.sh   # 3ª carga: revarre
```

Inspecionar `$DEV_RUN_DIR/projects-detect-cache` (texto simples, uma linha de
assinatura + uma linha por projeto).

## Limitações

- a assinatura não desce além de `config/` — uma mudança dentro de
  `config/webpack/` sem alterar o mtime do próprio `config/` (raro, exige
  tocar um arquivo dentro de um subdiretório mais profundo sem criar/remover
  entradas em `config/`) não invalida o cache; aceitável porque
  `_project_detect_type` e a detecção de webpack só olham a existência do
  diretório `config/webpack`, não seu conteúdo;
- alterar o conteúdo de um arquivo existente sem mudar `mtime` do diretório
  pai (ex.: `Gemfile` reescrito no mesmo timestamp, comum só em testes
  automatizados que manipulam mtime manualmente) não é coberto — cenário sem
  ocorrência prática em uso interativo real;
- o cache vive em `$DEV_RUN_DIR` (por UID, como PID/log de servidor) e não é
  limpo por `dev-clean` (que só varre `*.pid`/`*.log`); não há necessidade
  prática de limpeza manual porque a assinatura já invalida sozinha, mas
  removê-lo manualmente (`rm "$DEV_RUN_DIR/projects-detect-cache"`) força uma
  nova varredura sem precisar de `--force`.

## Arquivos alterados

- `lib/projects/cache.sh` (novo)
- `lib/projects/detect.sh`
- `lib/projects/init.sh`
- `init.sh`
- `tests/cli/cases/06-projects-cache.sh` (novo)
- `tests/cli/README.md`
- `docs/tasks/README.md`
- `docs/tasks/PARALLEL-WORK.md`
- `docs/PENDENCIAS.md`
