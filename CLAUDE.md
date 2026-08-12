# CLAUDE.md

Este arquivo fornece orientaÃ§Ãµes ao Claude Code (claude.ai/code) ao trabalhar com cÃ³digo neste repositÃ³rio.

## O que Ã© isto

O projeto possui **duas interfaces compartilhando um mesmo repositÃ³rio**, conforme `README.md` e `docs/architecture/overview.md`:

1. **O CLI bash original** â um dashboard interativo para alternar entre projetos locais (Rails e
   Node), iniciado a partir de qualquer shell via `dev-tools`. Ã uma biblioteca de funÃ§Ãµes shell
   carregadas no shell interativo do usuÃ¡rio (`~/.bashrc`), no espÃ­rito dos plugins do oh-my-zsh.
   Sem build step, sem compilador. Possui uma suÃ­te prÃ³pria pequena para os helpers nÃ£o
   interativos, em `tests/cli/` (`lib/*/tests/` Ã© outra coisa: menus para rodar a suÃ­te de testes
   *do projeto alvo*, ex. `bundle exec rspec`, nÃ£o testes deste codebase). Essa interface nÃ£o Ã©
   afetada pelo monorepo abaixo â nada em `apps/` ou `packages/` referencia `lib/`, e `init.sh`
   continua carregando-a exatamente como antes.
2. **Um dashboard web mais recente** â um monorepo TypeScript com npm workspaces (`apps/api`
   backend Fastify, `apps/web` frontend Vue 3 + Vite, `packages/*` bibliotecas compartilhadas) que
   reimplementa as mesmas capacidades (descoberta de workspaces/projetos, iniciar/parar servidores,
   logs) por trÃ¡s de uma API HTTP e uma UI no navegador. Ele *tem* compilador, build step e testes
   automatizados. Veja a seÃ§Ã£o "Monorepo do dashboard web" abaixo.

Conforme `docs/architecture/overview.md`, essa Ã© uma migraÃ§Ã£o incremental deliberada: o CLI
continua funcionando, o lado web reaproveita regras de `packages/*` quando possÃ­vel, e os dois nÃ£o
serÃ£o unificados atÃ© que a nova arquitetura prove seu valor. NÃ£o assuma que um estÃ¡ substituindo o
outro.

Textos de UI, comentÃ¡rios, mensagens de commit e **toda a documentaÃ§Ã£o** deste repositÃ³rio
(incluindo este arquivo) sÃ£o em portuguÃªs brasileiro â mantenha esse padrÃ£o ao editar arquivos
existentes ou criar novos.

Todo ajuste, correÃ§Ã£o ou nova funcionalidade que muda comportamento, rota, capacidade ou fluxo
precisa atualizar o documento correspondente em `docs/` (arquitetura, guias, seguranÃ§a) na mesma
entrega â nÃ£o depois. Uma mudanÃ§a estÃ¡ incompleta quando altera comportamento sem atualizar a
documentaÃ§Ã£o correspondente (ver a tabela "Onde documentar" em `CONTRIBUTING.md`).

## Fluxo de desenvolvimento

### CLI bash

```bash
# Recarrega o dashboard depois de editar (a partir de um shell onde ele jÃ¡ foi carregado, ou um shell novo)
source ~/.dev-dashboard/init.sh

# Verifica a sanidade do ambiente (versÃ£o do bash, gum, git, node, ruby, bundler, cliente mysql, DEV_BASE, DEV_RUN_DIR)
dev-doctor

# Imprime a referÃªncia completa de comandos (mantida manualmente em lib/doctor/help.sh)
dev-help

# Inicia o dashboard interativo
dev-tools
```

Como a maioria das funÃ§Ãµes Ã© interativa (menus, prompts, subshells), verificar uma mudanÃ§a
geralmente significa rodar a funÃ§Ã£o especÃ­fica diretamente em um shell com o dashboard carregado
(ex. `git-save "test"`, `dev-status-all`) em vez de escrever um teste automatizado.

Os helpers **nÃ£o interativos** (`_dev_*`, `_project_*`, `_git_*`, `_new_*` puros â sem `gum`, sem
`read -r -p`) tÃªm uma suÃ­te prÃ³pria em `tests/cli/` (sÃ³ `bash` + `git`, sem dependÃªncia externa):

```bash
tests/cli/run.sh
```

Veja `tests/cli/README.md` para a convenÃ§Ã£o de casos. Isso Ã© diferente de `lib/*/tests/`, que sÃ£o
menus para rodar a suÃ­te de testes *do projeto alvo* (ex. `bundle exec rspec`), nÃ£o testes deste
codebase.

`init.sh` protege contra carregamento duplicado via `DEV_LOADED`; se vocÃª estiver testando mudanÃ§as
em mÃºltiplas passagens de source no mesmo shell, faÃ§a `unset DEV_LOADED` primeiro ou inicie um
shell novo.

### Dashboard web (`apps/`, `packages/`)

```bash
npm install        # uma vez, a partir da raiz do repo

npm run dev        # API (127.0.0.1:4343) + web (127.0.0.1:5173) juntos
npm run dev:api    # sÃ³ a API
npm run dev:web    # sÃ³ o web

npm run typecheck  # tsc --build em todos os workspaces
npm run build      # packages primeiro, depois apps (veja abaixo)
npm test           # --workspaces --if-present; mede cobertura e falha abaixo do piso por workspace (ratchet, task 122 â ver "Cobertura" em CONTRIBUTING.md)
npm run test:e2e   # build + Playwright smoke em apps/web/e2e
npm run doctor     # valida Node/npm/Git/dependÃªncias/portas sem iniciar nada
npm run dev-web    # builda e serve API + frontend estÃ¡tico numa porta sÃ³ (distribuiÃ§Ã£o local)

npm run lint         # ESLint em apps/, packages/ e scripts/
npm run lint:fix     # idem, aplicando correÃ§Ãµes automÃ¡ticas possÃ­veis
npm run format       # Prettier no mesmo escopo do lint
npm run format:check # confere formataÃ§Ã£o sem regravar (usado no CI)

npm run docs:dev        # central de documentaÃ§Ã£o local em 127.0.0.1:4545
npm run docs:api        # regenera docs/architecture/api-reference.md a partir dos schemas Fastify
npm run docs:api:check  # confere se a referÃªncia estÃ¡ atualizada, sem regravar (usado no CI)
npm run changelog       # regenera CHANGELOG.md a partir do git log (task 093)
npm run release -- <patch|minor|major>  # bump de versÃ£o + changelog (task 116; ver CONTRIBUTING.md)
```

`build`, `typecheck`, `dev`, `dev:api` e `dev:web` tÃªm todos um script `pre*` que roda
`build:packages` primeiro (`contracts` â `core` â `project-discovery` â `process-manager`, nessa
ordem) â os apps importam a saÃ­da compilada em `dist/` desses packages, nÃ£o seus fontes TS
diretamente, entÃ£o um `dist/` desatualizado depois de editar um package Ã© uma fonte comum de
confusÃ£o.

`.github/workflows/ci.yml` roda `typecheck` â `lint` â `format:check` â `build` â
`docs:api:check` â `test` em todo push/PR (Node 24), mais um job separado de smoke E2E. O
`engines` do `package.json` raiz exige Node `^20.19.0 || >=22.12.0`.

`.github/workflows/release-prepare.yml` (disparo manual) e `release-tag.yml` (em push que muda
`package.json` em `main`) automatizam bump de versÃ£o, `CHANGELOG.md` e GitHub Release â projeto Ã©
`"private": true`, sem publicaÃ§Ã£o em registro npm (task 116, ver "Release" em `CONTRIBUTING.md`).

### Rodando um teste especÃ­fico

Cada workspace usa o runner nativo do Node (`node --test`) com `tsx` para carregar `.ts`, exceto
`apps/web` (Vitest + Playwright):

```bash
# um pacote (apps/api, packages/core, packages/process-manager, packages/project-discovery)
npm run build --workspace=@dev-dashboard/contracts  # dependÃªncias primeiro, se necessÃ¡rio
node --import=tsx --test apps/api/test/processes.test.ts

# apps/web â testes unitÃ¡rios/componentes (Vitest)
npm run test --workspace=@dev-dashboard/web -- run caminho/do/arquivo.spec.ts

# apps/web â smoke E2E (Playwright), a partir de apps/web/
npx playwright test --config=e2e/playwright.config.ts caminho/do/arquivo.spec.ts
```

## Monorepo do dashboard web (`apps/`, `packages/`)

npm workspaces, definidos no `package.json` raiz (`apps/*`, `packages/*`):

- **`apps/api`** â Fastify + JSON Schema, escuta somente em `127.0.0.1`. Rotas em
  `apps/api/src/routes/*.ts`, um arquivo por domÃ­nio (`health`, `workspaces`, `projects`,
  `processes`, `git-mutations`, `git-pull-request`, `database`, `rails`, `scripts`,
  entre outros); cada rota declara `params`,
  `body`, `querystring` e `response` explicitamente. Erros passam por `ApiError`/`ApiErrorCode` em
  `apps/api/src/http/api-error.ts` â um novo tipo de erro precisa entrar nessa uniÃ£o; schemas de
  resposta compartilhados em `apps/api/src/http/response-schemas.ts`; validaÃ§Ã£o de token/CORS em
  `apps/api/src/security/local-security.ts`; cache em memÃ³ria de projetos descobertos em
  `apps/api/src/store/project-store.ts`. Processos gerenciados tÃªm `kind` `'server'`, `'test'`,
  `'worker'` ou `'webpack'` (`packages/process-manager`) â a lista `MANAGED_KINDS`
  (`process-store.ts`) Ã© a Ãºnica fonte de verdade, compartilhada com o regex de nome de arquivo em
  `sweepStaleProcesses` (`log-retention.ts`), entÃ£o adicionar um `kind` novo Ã© sÃ³ atualizar essa
  lista; `resolveLogFile`/`resolveProcessFile` e os mapas `observedExits`/`exitWaiters` jÃ¡ sÃ£o
  genÃ©ricos por chave de string, nÃ£o precisam de mudanÃ§a. `'script'` fica de fora de propÃ³sito â
  processos de script tÃªm ciclo de vida e persistÃªncia prÃ³prios em
  `apps/api/src/services/script-execution/`, independentes do `ProcessStore`.
- **`apps/web`** â SFCs Vue 3 + Vite, comunica com a API via `fetch` (`apps/web/src/api.ts`,
  `requestJson` centraliza o tratamento de erro). NÃ£o deve executar comandos locais nem acessar o
  filesystem diretamente â isso Ã© responsabilidade da API. Ao trocar de projeto selecionado, painÃ©is
  precisam invalidar seu prÃ³prio estado (padrÃ£o `generation`, ver `ProjectGitPanel.vue` /
  `ProjectTestsPanel.vue`). Rotas em `apps/web/src/router/index.ts`; `ProjectDetailsView` reaproveita
  o mesmo componente para as sub-rotas (`project-details`, `project-git`, `project-tests`).
- **`packages/contracts`** â apenas tipos TS compartilhados (`Workspace`, `Project`,
  `ManagedProcess`, `ProcessLogSnapshot`, `Job`); sem lÃ³gica de infraestrutura, sem dependÃªncia de
  Fastify ou Vue, e sem novas dependÃªncias â Ã© intencionalmente sÃ³-tipos.
- **`packages/core`** â persistÃªncia da configuraÃ§Ã£o de workspaces e da retenÃ§Ã£o limitada
  (`~/.config/dev-dashboard/config.json`, respeita `DEV_DASHBOARD_CONFIG_DIR`/`XDG_CONFIG_HOME`) e
  o armazenamento do token local da API; sem dependÃªncia de Fastify ou Vue.
- **`packages/project-discovery`** â o equivalente TS da lÃ³gica de `lib/projects/detect.sh`:
  escaneia um workspace, identifica Rails (`Gemfile` com `rails`) / Node (`package.json`), detecta
  capacidades. Sem prompts, sem dependÃªncia de interface interativa.
- **`packages/process-manager`** â equivalente TS de `lib/server/core/start.sh`: escolhe comandos
  conhecidos, inicia sem `shell: true`, rastreia PID/porta, verifica a identidade do processo via
  `/proc/<pid>/cwd` antes de sinalizar, TERM depois KILL.

NÃ£o existe hoje um adaptador compartilhado entre o CLI e o monorepo. O Bash em `lib/` e a API
continuam independentes; uma eventual extraÃ§Ã£o precisa de decisÃ£o arquitetural e modelo de ameaÃ§a
prÃ³prios, em vez de um pacote placeholder.

Narrativa completa, diagramas e sequÃªncias de fluxo de dados: `docs/architecture/overview.md`.

### DocumentaÃ§Ã£o de tasks

Cada entrega funcional do dashboard web tem um arquivo numerado em `tasks/NNN-*.md`. `docs/` Ã©
apenas documentaÃ§Ã£o viva do produto (arquitetura, guias, seguranÃ§a); planejamento e histÃ³rico de
entregas vivem em `tasks/` (`PENDENCIAS.md`, `NEXT.md`, e os arquivos
numerados `tasks/NNN-*.md`). Ao concluir uma task: registre esse arquivo com o resultado
real (status, arquivos, decisÃµes, limitaÃ§Ãµes) e substitua `tasks/NEXT.md` pelo plano detalhado da
prÃ³xima entrega. Leia `tasks/NEXT.md` antes de comeÃ§ar um trabalho novo nessa parte do
repositÃ³rio.

## Modelo de seguranÃ§a da API

A API Ã© um processo local privilegiado (acesso a filesystem e processos) e Ã© tratada como tal â
veja `docs/architecture/security.md` e seu **checklist antes de adicionar um novo endpoint**, que
vocÃª deve ler antes de criar qualquer rota nova:

- Escuta somente em `127.0.0.1`, nunca em `0.0.0.0`; nÃ£o deve ser exposta Ã  rede nem Ã  internet.
- CatÃ¡logo fechado de aÃ§Ãµes â nenhuma string de shell arbitrÃ¡ria chega a `spawn`/`exec`.
- Um token aleatÃ³rio de 32 bytes Ã© gerado no primeiro uso, persistido em
  `~/.config/dev-dashboard/api-token` (`0600`), exigido via o header `X-Dev-Dashboard-Token` nas
  rotas privadas, comparado com `timingSafeEqual`. `GET /api/health` Ã© a Ãºnica rota pÃºblica.
- CORS Ã© uma lista fechada (`http://127.0.0.1:5173`, `http://localhost:5173`, `http://127.0.0.1:4173`,
  `http://localhost:4173`); o proxy do Vite em
  desenvolvimento anexa o token do lado do servidor, entÃ£o ele nunca fica presente no bundle do
  frontend.
- Leituras de log tÃªm limite (262144 bytes, priorizando o final do arquivo) e sÃ£o restritas a
  processos que o prÃ³prio dashboard iniciou â nunca um caminho arbitrÃ¡rio vindo do navegador.
- Schemas de resposta (`apps/api/src/http/response-schemas.ts`) limitam a serializaÃ§Ã£o exatamente
  Ã s propriedades do contrato pÃºblico (`packages/contracts`) â qualquer campo interno que vaze para
  um objeto retornado Ã© descartado na serializaÃ§Ã£o, nÃ£o apenas documentado.

## Internals do CLI bash

As seÃ§Ãµes abaixo (ordem de carregamento, convenÃ§Ã£o de nomes, estado global, padrÃ£o de UI,
gerenciamento de processos, fluxo de router) descrevem **especificamente o CLI bash** (`lib/`,
`init.sh`). Elas sÃ£o anteriores ao monorepo do dashboard web acima e nÃ£o sÃ£o afetadas por ele, que
tem suas prÃ³prias convenÃ§Ãµes documentadas em `docs/architecture/overview.md`.

## Ordem de carregamento e arquitetura de mÃ³dulos

`init.sh` Ã© o Ãºnico ponto de entrada (carregado a partir do `~/.bashrc`). Ele resolve
`DEV_DASHBOARD_DIR` (seguro contra symlink), entÃ£o carrega os mÃ³dulos de topo **em uma sequÃªncia
fixa e ordenada por dependÃªncia** â cada etapa assume que as funÃ§Ãµes pÃºblicas da etapa anterior jÃ¡
existem:

1. `lib/core/init.sh` â sem dependÃªncias. Logging (`_dev_ok/_dev_err/_dev_warn`), `_dev_has`
   (checagem de existÃªncia de comando), detecÃ§Ã£o de SO, `cd` seguro (`_dev_cd`), a UI de
   breadcrumb/header, o spinner (`_dev_spin`), executores de processo (`_dev_run_rails`, etc.), e o
   carregamento de `~/.dev-dashboard.secrets`.
2. `lib/projects/init.sh` â descoberta e metadados de projetos (depende do core para
   logging/avisos).
3. `lib/server/init.sh` â ciclo de vida de processos (depende de projects para lookup de
   porta/caminho).
4. `lib/ui/init.sh`, `lib/actions/init.sh`, `lib/dashboard/init.sh` â o shell interativo (dependem
   de projects + server para o que exibir e executar).
5. `lib/doctor/init.sh` â diagnÃ³stico do ambiente.
6. `lib/git/init.sh`, `lib/rails/init.sh`, `lib/node/init.sh` â submÃ³dulos de funcionalidade
   **opcionais**, carregados com `required=false`: um arquivo ausente apenas emite um aviso, nÃ£o
   aborta o carregamento.
7. `load_project_config` + `detect_projects` rodam para popular o estado global.
8. As funÃ§Ãµes pÃºblicas de entrada recebem `export -f` para sobreviverem em subshells (ex.
   `dev-terminal`, `dev-claude`).

Cada diretÃ³rio sob `lib/` segue a mesma convenÃ§Ã£o de loader: um `init.sh` que carrega seus
irmÃ£os/filhos de forma defensiva (arquivo ausente â aviso via `echo` + `return 1`, nunca um crash
duro) e faz `export -f` apenas das funÃ§Ãµes pÃºblicas daquele mÃ³dulo. Pastas de funcionalidade mais
profundas (ex. `lib/git/save/`, `lib/rails/database/`) se dividem ainda mais em:
- `init.sh` â carrega `helpers.sh` e depois o(s) arquivo(s) de aÃ§Ã£o, exporta a funÃ§Ã£o pÃºblica.
- `helpers.sh` â lÃ³gica privada, sempre prefixada com `_` (ex. `_save_prefix`, `_save_commit`).
- `run.sh` (ou arquivos nomeados por verbo como `start.sh`/`stop.sh`/`logs.sh`/`menu.sh`) â a(s)
  funÃ§Ã£o(Ãµes) pÃºblica(s) chamÃ¡vel(is) a partir do dashboard ou diretamente em um shell.

Ao adicionar um novo mÃ³dulo de funcionalidade, siga exatamente essa estrutura de trÃªs arquivos e
conecte-o ao `init.sh` pai da mesma forma que os mÃ³dulos irmÃ£os existentes estÃ£o conectados â nÃ£o
invente uma nova convenÃ§Ã£o de carregamento.

## ConvenÃ§Ã£o de nomes

- Comandos pÃºblicos, voltados ao usuÃ¡rio: kebab-case, chamÃ¡veis diretamente de qualquer shell â
  `dev-*` (nÃ­vel dashboard: `dev-tools`, `dev-status-all`, `dev-stop-all`), `git-*` (`git-save`,
  `git-new`, `git-tools`), `project-*` (`project-path`, `project-port`, `project-list`).
  Essas sÃ£o as funÃ§Ãµes que recebem `export -f`.
- Helpers privados/internos: prefixados com `_`, snake_case, nÃ£o exportados alÃ©m da cadeia
  `init.sh` do prÃ³prio mÃ³dulo, a menos que outro mÃ³dulo dependa explicitamente deles (ex.
  `_is_port_in_use` de `server/core` Ã© usado por `ui/menu.sh`).

## Estado global

- `DEV_BASE` â diretÃ³rio raiz escaneado em busca de projetos (padrÃ£o `$HOME/Caiena/Projetos`). Todo
  diretÃ³rio de projeto sob ele Ã© auto-detectado como `rails` (tem `Gemfile` contendo "rails"),
  `node` (tem `package.json`), ou ignorado como `unknown`.
- `DEV_DASHBOARD_DIR` â localizaÃ§Ã£o de instalaÃ§Ã£o resolvida deste repo, usada para montar todos os
  caminhos de `source`.
- `DEV_RUN_DIR` â diretÃ³rio de scratch por UID (`/tmp/dev-dashboard-$UID` por padrÃ£o) contendo
  estado em runtime: `<project-id>.pid` / `<project-id>.log` para cada servidor rodando,
  `webpack-<project-id>.pid` para watchers de webpack. `_dev_project_id` deriva o id transformando
  em minÃºsculas e substituindo caracteres nÃ£o-alfanumÃ©ricos por `-`.
- `PROJECT_META` (array associativo) â uma entrada por projeto detectado, uma string `key:value`
  delimitada por `|` (`path:...|type:...|port:...|mysql:...|webpack:...`) lida via
  `_project_get_field` (`lib/projects/helpers.sh`). ReconstruÃ­da toda vez que `detect_projects`
  roda.
- `PROJECT_CONFIG` (array associativo) â overrides brutos de `config/projects.conf` (linhas
  `name:port`), mesclados em `PROJECT_META` durante a detecÃ§Ã£o para que portas fixas prevaleÃ§am
  sobre a atribuiÃ§Ã£o automÃ¡tica (portas auto-atribuÃ­das comeÃ§am em 3000 e pulam qualquer uma jÃ¡
  reivindicada).
- `~/.dev-dashboard.secrets` â opcional, carregado por Ãºltimo por `lib/core/secrets.sh`; as
  permissÃµes sÃ£o corrigidas automaticamente para `600` se encontradas mais abertas.

## PadrÃ£o de UI: gum com fallback em texto puro

Quase toda funÃ§Ã£o interativa ramifica em `_dev_has gum`: se o
[charmbracelet/gum](https://github.com/charmbracelet/gum) estiver instalado, ele Ã© usado para
tabelas/menus/spinners/confirmaÃ§Ãµes estilizados; caso contrÃ¡rio, existe uma implementaÃ§Ã£o paralela
em `read -r -p` / menu numerado / `echo` em texto puro. Ao mexer em qualquer funÃ§Ã£o voltada Ã  UI,
atualize **ambos** os ramos â o caminho em texto puro nÃ£o Ã© cÃ³digo legado, Ã© o modo suportado sem
dependÃªncias (veja `dev-doctor`, que trata explicitamente a ausÃªncia do `gum` como aviso, nÃ£o
erro).

## Modelo de gerenciamento de processos

Servidores sÃ£o iniciados via `_dev_start_server` (`lib/server/core/start.sh`) com `nohup ... &`,
PID gravado em `$DEV_RUN_DIR/<id>.pid`, saÃ­da redirecionada para `$DEV_RUN_DIR/<id>.log`. Parar
(`dev-stop`) faz TERM â espera 1s â escalonamento para KILL, e tambÃ©m libera Ã  forÃ§a a porta do
projeto via `lsof`/`fuser` caso os filhos do PID rastreado tenham se destacado. `dev-clean` varre
arquivos de PID obsoletos cujo processo nÃ£o existe mais. Servidores Rails e Node compartilham esse
mesmo nÃºcleo; Rails passa `-p $port -b 0.0.0.0` no comando, projetos Node sÃ£o iniciados via
`lib/node/server` ou um fallback que detecta yarn/npm e um script `dev` no `package.json`.

## Fluxo de router/menu

`dev-tools` â `dev-dashboard` (`lib/dashboard/loop.sh`) mostra `project-menu` (lista de projetos
detectados com status/porta/branch), depois para o projeto escolhido mostra `dev-project-actions`
(`lib/ui/menu.sh`), e despacha a aÃ§Ã£o escolhida atravÃ©s de `dev-run-command`
(`lib/dashboard/router.sh`). Adicionar uma nova aÃ§Ã£o de topo significa: adicionar uma linha em
`dev-project-actions`, adicionar um branch `case` em `dev-run-command`, e (se ela entrega para uma
sessÃ£o interativa de longa duraÃ§Ã£o como `dev-claude`/`dev-terminal`) adicionÃ¡-la Ã  lista de exclusÃ£o
de `_dev_pause` em `lib/dashboard/loop.sh` para que o dashboard nÃ£o pergunte duas vezes depois que
ela retornar.
