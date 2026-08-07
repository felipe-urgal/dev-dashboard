# CLAUDE.md

Este arquivo fornece orientações ao Claude Code (claude.ai/code) ao trabalhar com código neste repositório.

## O que é isto

O projeto possui **duas interfaces compartilhando um mesmo repositório**, conforme `README.md` e `docs/architecture/overview.md`:

1. **O CLI bash original** — um dashboard interativo para alternar entre projetos locais (Rails e
   Node), iniciado a partir de qualquer shell via `dev-tools`. É uma biblioteca de funções shell
   carregadas no shell interativo do usuário (`~/.bashrc`), no espírito dos plugins do oh-my-zsh.
   Sem build step, sem compilador. Possui uma suíte própria pequena para os helpers não
   interativos, em `tests/cli/` (`lib/*/tests/` é outra coisa: menus para rodar a suíte de testes
   *do projeto alvo*, ex. `bundle exec rspec`, não testes deste codebase). Essa interface não é
   afetada pelo monorepo abaixo — nada em `apps/` ou `packages/` referencia `lib/`, e `init.sh`
   continua carregando-a exatamente como antes.
2. **Um dashboard web mais recente** — um monorepo TypeScript com npm workspaces (`apps/api`
   backend Fastify, `apps/web` frontend Vue 3 + Vite, `packages/*` bibliotecas compartilhadas) que
   reimplementa as mesmas capacidades (descoberta de workspaces/projetos, iniciar/parar servidores,
   logs) por trás de uma API HTTP e uma UI no navegador. Ele *tem* compilador, build step e testes
   automatizados. Veja a seção "Monorepo do dashboard web" abaixo.

Conforme `docs/architecture/overview.md`, essa é uma migração incremental deliberada: o CLI
continua funcionando, o lado web reaproveita regras de `packages/*` quando possível, e os dois não
serão unificados até que a nova arquitetura prove seu valor. Não assuma que um está substituindo o
outro.

Textos de UI, comentários, mensagens de commit e **toda a documentação** deste repositório
(incluindo este arquivo) são em português brasileiro — mantenha esse padrão ao editar arquivos
existentes ou criar novos.

Todo ajuste, correção ou nova funcionalidade que muda comportamento, rota, capacidade ou fluxo
precisa atualizar o documento correspondente em `docs/` (arquitetura, guias, segurança) na mesma
entrega — não depois. Uma mudança está incompleta quando altera comportamento sem atualizar a
documentação correspondente (ver a tabela "Onde documentar" em `CONTRIBUTING.md`).

## Fluxo de desenvolvimento

### CLI bash

```bash
# Recarrega o dashboard depois de editar (a partir de um shell onde ele já foi carregado, ou um shell novo)
source ~/.dev-dashboard/init.sh

# Verifica a sanidade do ambiente (versão do bash, gum, git, node, ruby, bundler, cliente mysql, DEV_BASE, DEV_RUN_DIR)
dev-doctor

# Imprime a referência completa de comandos (mantida manualmente em lib/doctor/help.sh)
dev-help

# Inicia o dashboard interativo
dev-tools
```

Como a maioria das funções é interativa (menus, prompts, subshells), verificar uma mudança
geralmente significa rodar a função específica diretamente em um shell com o dashboard carregado
(ex. `git-save "test"`, `dev-status-all`) em vez de escrever um teste automatizado.

Os helpers **não interativos** (`_dev_*`, `_project_*`, `_git_*`, `_new_*` puros — sem `gum`, sem
`read -r -p`) têm uma suíte própria em `tests/cli/` (só `bash` + `git`, sem dependência externa):

```bash
tests/cli/run.sh
```

Veja `tests/cli/README.md` para a convenção de casos. Isso é diferente de `lib/*/tests/`, que são
menus para rodar a suíte de testes *do projeto alvo* (ex. `bundle exec rspec`), não testes deste
codebase.

`init.sh` protege contra carregamento duplicado via `DEV_LOADED`; se você estiver testando mudanças
em múltiplas passagens de source no mesmo shell, faça `unset DEV_LOADED` primeiro ou inicie um
shell novo.

### Dashboard web (`apps/`, `packages/`)

```bash
npm install        # uma vez, a partir da raiz do repo

npm run dev        # API (127.0.0.1:4343) + web (127.0.0.1:5173) juntos
npm run dev:api    # só a API
npm run dev:web    # só o web

npm run typecheck  # tsc --build em todos os workspaces
npm run build      # packages primeiro, depois apps (veja abaixo)
npm test           # --workspaces --if-present; mede cobertura e falha abaixo do piso por workspace (ratchet, task 122 — ver "Cobertura" em CONTRIBUTING.md)
npm run test:e2e   # build + Playwright smoke em apps/web/e2e
npm run doctor     # valida Node/npm/Git/dependências/portas sem iniciar nada
npm run dev-web    # builda e serve API + frontend estático numa porta só (distribuição local)

npm run lint         # ESLint em apps/, packages/ e scripts/
npm run lint:fix     # idem, aplicando correções automáticas possíveis
npm run format       # Prettier no mesmo escopo do lint
npm run format:check # confere formatação sem regravar (usado no CI)

npm run docs:dev        # central de documentação local em 127.0.0.1:4545
npm run docs:api        # regenera docs/architecture/api-reference.md a partir dos schemas Fastify
npm run docs:api:check  # confere se a referência está atualizada, sem regravar (usado no CI)
npm run changelog       # regenera CHANGELOG.md a partir do git log (task 093)
npm run release -- <patch|minor|major>  # bump de versão + changelog (task 116; ver CONTRIBUTING.md)
```

`build`, `typecheck`, `dev`, `dev:api` e `dev:web` têm todos um script `pre*` que roda
`build:packages` primeiro (`contracts` → `core` → `project-discovery` → `process-manager`, nessa
ordem) — os apps importam a saída compilada em `dist/` desses packages, não seus fontes TS
diretamente, então um `dist/` desatualizado depois de editar um package é uma fonte comum de
confusão.

`.github/workflows/ci.yml` roda `typecheck` → `lint` → `format:check` → `build` →
`docs:api:check` → `test` em todo push/PR (Node 24), mais um job separado de smoke E2E. O
`engines` do `package.json` raiz exige Node `^20.19.0 || >=22.12.0`.

`.github/workflows/release-prepare.yml` (disparo manual) e `release-tag.yml` (em push que muda
`package.json` em `main`) automatizam bump de versão, `CHANGELOG.md` e GitHub Release — projeto é
`"private": true`, sem publicação em registro npm (task 116, ver "Release" em `CONTRIBUTING.md`).

### Rodando um teste específico

Cada workspace usa o runner nativo do Node (`node --test`) com `tsx` para carregar `.ts`, exceto
`apps/web` (Vitest + Playwright):

```bash
# um pacote (apps/api, packages/core, packages/process-manager, packages/project-discovery)
npm run build --workspace=@dev-dashboard/contracts  # dependências primeiro, se necessário
node --import=tsx --test apps/api/test/processes.test.ts

# apps/web — testes unitários/componentes (Vitest)
npm run test --workspace=@dev-dashboard/web -- run caminho/do/arquivo.spec.ts

# apps/web — smoke E2E (Playwright), a partir de apps/web/
npx playwright test --config=e2e/playwright.config.ts caminho/do/arquivo.spec.ts
```

## Monorepo do dashboard web (`apps/`, `packages/`)

npm workspaces, definidos no `package.json` raiz (`apps/*`, `packages/*`):

- **`apps/api`** — Fastify + JSON Schema, escuta somente em `127.0.0.1`. Rotas em
  `apps/api/src/routes/{health,workspaces,projects,processes}.ts`; cada rota declara `params`,
  `body`, `querystring` e `response` explicitamente. Erros passam por `ApiError`/`ApiErrorCode` em
  `apps/api/src/http/api-error.ts` — um novo tipo de erro precisa entrar nessa união; schemas de
  resposta compartilhados em `apps/api/src/http/response-schemas.ts`; validação de token/CORS em
  `apps/api/src/security/local-security.ts`; cache em memória de projetos descobertos em
  `apps/api/src/store/project-store.ts`. Processos gerenciados têm `kind` `'server'`, `'test'`,
  `'worker'` ou `'webpack'` (`packages/process-manager`) — a lista `MANAGED_KINDS`
  (`process-store.ts`) é a única fonte de verdade, compartilhada com o regex de nome de arquivo em
  `sweepStaleProcesses` (`log-retention.ts`), então adicionar um `kind` novo é só atualizar essa
  lista; `resolveLogFile`/`resolveProcessFile` e os mapas `observedExits`/`exitWaiters` já são
  genéricos por chave de string, não precisam de mudança. `'script'` fica de fora de propósito —
  processos de script têm ciclo de vida e persistência próprios em
  `apps/api/src/services/script-execution/`, independentes do `ProcessStore`.
- **`apps/web`** — SFCs Vue 3 + Vite, comunica com a API via `fetch` (`apps/web/src/api.ts`,
  `requestJson` centraliza o tratamento de erro). Não deve executar comandos locais nem acessar o
  filesystem diretamente — isso é responsabilidade da API. Ao trocar de projeto selecionado, painéis
  precisam invalidar seu próprio estado (padrão `generation`, ver `ProjectGitPanel.vue` /
  `ProjectTestsPanel.vue`). Rotas em `apps/web/src/router/index.ts`; `ProjectDetailsView` reaproveita
  o mesmo componente para as sub-rotas (`project-details`, `project-git`, `project-tests`).
- **`packages/contracts`** — apenas tipos TS compartilhados (`Workspace`, `Project`,
  `ManagedProcess`, `ProcessLogSnapshot`, `Job`); sem lógica de infraestrutura, sem dependência de
  Fastify ou Vue, e sem novas dependências — é intencionalmente só-tipos.
- **`packages/core`** — persistência da configuração de workspaces e da retenção limitada
  (`~/.config/dev-dashboard/config.json`, respeita `DEV_DASHBOARD_CONFIG_DIR`/`XDG_CONFIG_HOME`) e
  o armazenamento do token local da API; sem dependência de Fastify ou Vue.
- **`packages/project-discovery`** — o equivalente TS da lógica de `lib/projects/detect.sh`:
  escaneia um workspace, identifica Rails (`Gemfile` com `rails`) / Node (`package.json`), detecta
  capacidades. Sem prompts, sem dependência de interface interativa.
- **`packages/process-manager`** — equivalente TS de `lib/server/core/start.sh`: escolhe comandos
  conhecidos, inicia sem `shell: true`, rastreia PID/porta, verifica a identidade do processo via
  `/proc/<pid>/cwd` antes de sinalizar, TERM depois KILL.

Não existe hoje um adaptador compartilhado entre o CLI e o monorepo. O Bash em `lib/` e a API
continuam independentes; uma eventual extração precisa de decisão arquitetural e modelo de ameaça
próprios, em vez de um pacote placeholder.

Narrativa completa, diagramas e sequências de fluxo de dados: `docs/architecture/overview.md`.

### Documentação de tasks

Cada entrega funcional do dashboard web tem um arquivo numerado em `tasks/NNN-*.md`. `docs/` é
apenas documentação viva do produto (arquitetura, guias, segurança); planejamento e histórico de
entregas vivem em `tasks/` (`PENDENCIAS.md`, `NEXT.md`, e os arquivos
numerados `tasks/NNN-*.md`). Ao concluir uma task: registre esse arquivo com o resultado
real (status, arquivos, decisões, limitações) e substitua `tasks/NEXT.md` pelo plano detalhado da
próxima entrega. Leia `tasks/NEXT.md` antes de começar um trabalho novo nessa parte do
repositório.

## Modelo de segurança da API

A API é um processo local privilegiado (acesso a filesystem e processos) e é tratada como tal —
veja `docs/architecture/security.md` e seu **checklist antes de adicionar um novo endpoint**, que
você deve ler antes de criar qualquer rota nova:

- Escuta somente em `127.0.0.1`, nunca em `0.0.0.0`; não deve ser exposta à rede nem à internet.
- Catálogo fechado de ações — nenhuma string de shell arbitrária chega a `spawn`/`exec`.
- Um token aleatório de 32 bytes é gerado no primeiro uso, persistido em
  `~/.config/dev-dashboard/api-token` (`0600`), exigido via o header `X-Dev-Dashboard-Token` nas
  rotas privadas, comparado com `timingSafeEqual`. `GET /api/health` é a única rota pública.
- CORS é uma lista fechada (`http://127.0.0.1:5173`, `http://localhost:5173`, `http://127.0.0.1:4173`,
  `http://localhost:4173`); o proxy do Vite em
  desenvolvimento anexa o token do lado do servidor, então ele nunca fica presente no bundle do
  frontend.
- Leituras de log têm limite (262144 bytes, priorizando o final do arquivo) e são restritas a
  processos que o próprio dashboard iniciou — nunca um caminho arbitrário vindo do navegador.
- Schemas de resposta (`apps/api/src/http/response-schemas.ts`) limitam a serialização exatamente
  às propriedades do contrato público (`packages/contracts`) — qualquer campo interno que vaze para
  um objeto retornado é descartado na serialização, não apenas documentado.

## Internals do CLI bash

As seções abaixo (ordem de carregamento, convenção de nomes, estado global, padrão de UI,
gerenciamento de processos, fluxo de router) descrevem **especificamente o CLI bash** (`lib/`,
`init.sh`). Elas são anteriores ao monorepo do dashboard web acima e não são afetadas por ele, que
tem suas próprias convenções documentadas em `docs/architecture/overview.md`.

## Ordem de carregamento e arquitetura de módulos

`init.sh` é o único ponto de entrada (carregado a partir do `~/.bashrc`). Ele resolve
`DEV_DASHBOARD_DIR` (seguro contra symlink), então carrega os módulos de topo **em uma sequência
fixa e ordenada por dependência** — cada etapa assume que as funções públicas da etapa anterior já
existem:

1. `lib/core/init.sh` — sem dependências. Logging (`_dev_ok/_dev_err/_dev_warn`), `_dev_has`
   (checagem de existência de comando), detecção de SO, `cd` seguro (`_dev_cd`), a UI de
   breadcrumb/header, o spinner (`_dev_spin`), executores de processo (`_dev_run_rails`, etc.), e o
   carregamento de `~/.dev-dashboard.secrets`.
2. `lib/projects/init.sh` — descoberta e metadados de projetos (depende do core para
   logging/avisos).
3. `lib/server/init.sh` — ciclo de vida de processos (depende de projects para lookup de
   porta/caminho).
4. `lib/ui/init.sh`, `lib/actions/init.sh`, `lib/dashboard/init.sh` — o shell interativo (dependem
   de projects + server para o que exibir e executar).
5. `lib/doctor/init.sh` — diagnóstico do ambiente.
6. `lib/git/init.sh`, `lib/rails/init.sh`, `lib/node/init.sh` — submódulos de funcionalidade
   **opcionais**, carregados com `required=false`: um arquivo ausente apenas emite um aviso, não
   aborta o carregamento.
7. `load_project_config` + `detect_projects` rodam para popular o estado global.
8. As funções públicas de entrada recebem `export -f` para sobreviverem em subshells (ex.
   `dev-terminal`, `dev-claude`).

Cada diretório sob `lib/` segue a mesma convenção de loader: um `init.sh` que carrega seus
irmãos/filhos de forma defensiva (arquivo ausente → aviso via `echo` + `return 1`, nunca um crash
duro) e faz `export -f` apenas das funções públicas daquele módulo. Pastas de funcionalidade mais
profundas (ex. `lib/git/save/`, `lib/rails/database/`) se dividem ainda mais em:
- `init.sh` — carrega `helpers.sh` e depois o(s) arquivo(s) de ação, exporta a função pública.
- `helpers.sh` — lógica privada, sempre prefixada com `_` (ex. `_save_prefix`, `_save_commit`).
- `run.sh` (ou arquivos nomeados por verbo como `start.sh`/`stop.sh`/`logs.sh`/`menu.sh`) — a(s)
  função(ões) pública(s) chamável(is) a partir do dashboard ou diretamente em um shell.

Ao adicionar um novo módulo de funcionalidade, siga exatamente essa estrutura de três arquivos e
conecte-o ao `init.sh` pai da mesma forma que os módulos irmãos existentes estão conectados — não
invente uma nova convenção de carregamento.

## Convenção de nomes

- Comandos públicos, voltados ao usuário: kebab-case, chamáveis diretamente de qualquer shell —
  `dev-*` (nível dashboard: `dev-tools`, `dev-status-all`, `dev-stop-all`), `git-*` (`git-save`,
  `git-new`, `git-tools`), `project-*` (`project-path`, `project-port`, `project-list`).
  Essas são as funções que recebem `export -f`.
- Helpers privados/internos: prefixados com `_`, snake_case, não exportados além da cadeia
  `init.sh` do próprio módulo, a menos que outro módulo dependa explicitamente deles (ex.
  `_is_port_in_use` de `server/core` é usado por `ui/menu.sh`).

## Estado global

- `DEV_BASE` — diretório raiz escaneado em busca de projetos (padrão `$HOME/Caiena/Projetos`). Todo
  diretório de projeto sob ele é auto-detectado como `rails` (tem `Gemfile` contendo "rails"),
  `node` (tem `package.json`), ou ignorado como `unknown`.
- `DEV_DASHBOARD_DIR` — localização de instalação resolvida deste repo, usada para montar todos os
  caminhos de `source`.
- `DEV_RUN_DIR` — diretório de scratch por UID (`/tmp/dev-dashboard-$UID` por padrão) contendo
  estado em runtime: `<project-id>.pid` / `<project-id>.log` para cada servidor rodando,
  `webpack-<project-id>.pid` para watchers de webpack. `_dev_project_id` deriva o id transformando
  em minúsculas e substituindo caracteres não-alfanuméricos por `-`.
- `PROJECT_META` (array associativo) — uma entrada por projeto detectado, uma string `key:value`
  delimitada por `|` (`path:...|type:...|port:...|mysql:...|webpack:...`) lida via
  `_project_get_field` (`lib/projects/helpers.sh`). Reconstruída toda vez que `detect_projects`
  roda.
- `PROJECT_CONFIG` (array associativo) — overrides brutos de `config/projects.conf` (linhas
  `name:port`), mesclados em `PROJECT_META` durante a detecção para que portas fixas prevaleçam
  sobre a atribuição automática (portas auto-atribuídas começam em 3000 e pulam qualquer uma já
  reivindicada).
- `~/.dev-dashboard.secrets` — opcional, carregado por último por `lib/core/secrets.sh`; as
  permissões são corrigidas automaticamente para `600` se encontradas mais abertas.

## Padrão de UI: gum com fallback em texto puro

Quase toda função interativa ramifica em `_dev_has gum`: se o
[charmbracelet/gum](https://github.com/charmbracelet/gum) estiver instalado, ele é usado para
tabelas/menus/spinners/confirmações estilizados; caso contrário, existe uma implementação paralela
em `read -r -p` / menu numerado / `echo` em texto puro. Ao mexer em qualquer função voltada à UI,
atualize **ambos** os ramos — o caminho em texto puro não é código legado, é o modo suportado sem
dependências (veja `dev-doctor`, que trata explicitamente a ausência do `gum` como aviso, não
erro).

## Modelo de gerenciamento de processos

Servidores são iniciados via `_dev_start_server` (`lib/server/core/start.sh`) com `nohup ... &`,
PID gravado em `$DEV_RUN_DIR/<id>.pid`, saída redirecionada para `$DEV_RUN_DIR/<id>.log`. Parar
(`dev-stop`) faz TERM → espera 1s → escalonamento para KILL, e também libera à força a porta do
projeto via `lsof`/`fuser` caso os filhos do PID rastreado tenham se destacado. `dev-clean` varre
arquivos de PID obsoletos cujo processo não existe mais. Servidores Rails e Node compartilham esse
mesmo núcleo; Rails passa `-p $port -b 0.0.0.0` no comando, projetos Node são iniciados via
`lib/node/server` ou um fallback que detecta yarn/npm e um script `dev` no `package.json`.

## Fluxo de router/menu

`dev-tools` → `dev-dashboard` (`lib/dashboard/loop.sh`) mostra `project-menu` (lista de projetos
detectados com status/porta/branch), depois para o projeto escolhido mostra `dev-project-actions`
(`lib/ui/menu.sh`), e despacha a ação escolhida através de `dev-run-command`
(`lib/dashboard/router.sh`). Adicionar uma nova ação de topo significa: adicionar uma linha em
`dev-project-actions`, adicionar um branch `case` em `dev-run-command`, e (se ela entrega para uma
sessão interativa de longa duração como `dev-claude`/`dev-terminal`) adicioná-la à lista de exclusão
de `_dev_pause` em `lib/dashboard/loop.sh` para que o dashboard não pergunte duas vezes depois que
ela retornar.
