# Atividades pendentes

Inventário do que ainda falta implementar no Dev Dashboard. Este documento
lista só trabalho em aberto; itens concluídos ficam registrados em
`tasks/<NNN>-*.md` — `docs/` guarda apenas documentação viva do produto, não
o histórico de entregas.

## Regras para qualquer entrega

O Dev Dashboard evolui sem interromper o CLI Bash. Toda entrega web deve manter
a API em `127.0.0.1`, usar catálogo fechado de ações, receber apenas IDs e
valores validados do navegador e preservar schemas explícitos de resposta.

Antes de concluir uma entrega:

```bash
npm run lint
npm run format
npm run typecheck
npm run build
npm test
```

## Polling de status nunca desacelera quando parado

`useProjectProcessStatus.ts` (servidor) e `useProjectRailsWorker.ts` (Sidekiq/webpack) consultam o
status do processo gerenciado a cada 5s indefinidamente, mesmo com o processo parado há horas —
sem desacelerar nem parar. Padrão consistente nos dois lugares (não é bug isolado do Sidekiq,
achado ao investigar o painel), provavelmente proposital (detectar se algo iniciar o processo por
fora do dashboard). Vale reavaliar como uma frente própria — mudar só um painel criaria
inconsistência com o outro; mudar os dois é escopo maior que uma correção pontual.

## Validação manual do Assistente IA local

- Validar a task 232 com uma instalação real do Ollama e modelo com suporte a
  ferramentas. A suíte automatizada cobre o ciclo de vida da execução em
  memória, mas não substitui a qualidade das respostas do modelo escolhido.
- Validar a task 233 em uma revisão com comentários distribuídos por mais de
  um arquivo, conferindo o diff lado a lado e as ações de triagem.

---

## Varredura de melhorias e refatoração (2026-08-06)

Levantamento produzido por uma varredura completa do repositório, cobrindo as
duas interfaces (CLI bash em `lib/` e o monorepo web em `apps/`/`packages/`).
São só oportunidades de melhoria/refatoração — nada aqui bloqueia uso atual do
projeto. Prioridades sugeridas ao final de cada bloco.

### A. CLI bash (`lib/`, `init.sh`, `tests/cli/`)

#### A.1 Duplicação de código entre módulos

- **Confirmação gum vs texto puro duplicada ~28 vezes.** O padrão
  `if _dev_has gum; then gum confirm ...; else read -r -p "...(s/N)"; fi` se
  repete literalmente em 21 arquivos (`lib/git/*/helpers.sh`,
  `lib/rails/database/*.sh`, `lib/rails/bundler/run.sh`,
  `lib/node/deps/run.sh`, `lib/backup/run.sh`, `lib/server/core/start.sh`
  etc.). Já existe `_dev_pause` (`lib/core/interaction.sh:5`) como precedente
  de helper compartilhado gum/texto puro, mas nunca foi criado o equivalente
  `_dev_confirm "mensagem"`. **Sugestão:** extrair para
  `lib/core/interaction.sh`.
- **Menu gum table vs numeração manual duplicado em ~15+ lugares.**
  `_dev_has gum` aparece em 82 arquivos; o esqueleto "monta linhas
  `;`-separadas → `gum table`/`gum choose` → senão itera com índice numérico
  → `read` → valida `^[0-9]+$`" se repete quase idêntico em
  `lib/ui/menu.sh:6-97` (`project-menu`), `lib/ui/menu.sh:99-166`
  (`dev-project-actions`), `lib/git/status/helpers.sh:34-62`,
  `lib/rails/menu/helpers.sh`, `lib/rails/database/menu.sh`,
  `lib/node/menu/helpers.sh`, `lib/rails/generators/menu.sh`,
  `lib/rails/webpack/helpers.sh`, `lib/rails/sidekiq/helpers.sh`,
  `lib/rails/tests/menu.sh`, `lib/rails/assets/menu.sh`. **Sugestão:**
  `_dev_menu_select "Título" "opção1" "opção2" ...`.
- **Boilerplate "resolver path do projeto ou abortar" repetido 21 vezes,
  idêntico** (`lib/rails/routes/run.sh:6-13`, `lib/rails/bundler/run.sh:6-13`,
  `lib/node/deps/run.sh:6-13` e outros 18 arquivos):
  ```bash
  path=$(project-path "$project") || {
    _dev_err "Projeto '$project' não encontrado."
    sleep 3
    return 1
  }
  _dev_cd "$path" || return 1
  ```
  **Sugestão:** `_dev_enter_project "$project" || return 1`.
- **Verificação de "porta em uso" implementada cinco vezes diferentes**, com
  robustez divergente: `_is_port_in_use()` (`lib/server/core/helpers.sh:10`,
  só `lsof`), `_dev_port_open()` (`lib/core/services.sh:5`, mesma lógica,
  outro nome), `_check_port()` (`lib/server/core/wait_port.sh:5-11`, com
  fallback `ss`/`netstat`), uma quarta cópia inline dentro de um heredoc
  `bash -c "..."` no mesmo arquivo (linhas 21-28), e `_dev_database_running()`
  (`lib/rails/database/helpers.sh:43-62`) com fallback adicional via `pgrep`.
  Como `dev-doctor` exige `lsof` mas as duas primeiras não têm fallback
  `ss`/`netstat`, o comportamento diverge entre módulos mesmo em ambientes
  onde o usuário ignorou o aviso do doctor. **Sugestão:** consolidar num só
  `_dev_port_open "$port"` em `lib/core/services.sh` com os 3 fallbacks.
- **`_dev_get_branch_info` (`lib/ui/helpers.sh:7-19`) duplica
  `_dev_repo_label` (`lib/core/breadcrumb.sh:11-22`)** — o próprio comentário
  do arquivo admite que é "mantido por compatibilidade" e que a lógica real
  vive na outra função, mas nunca foi convertido num wrapper; risco de as
  duas divergirem se uma for corrigida e a outra não.
- **Wrappers vazios sem propósito** em `lib/git/new/helpers.sh:6-8`
  (`_new_show_header`, `_new_step`, `_new_clear` só repassam para
  `_dev_breadcrumb`/`_dev_step`/`_dev_clear`) — inconsistente com
  `rails/*`/`node/*`, que chamam os helpers de core diretamente.
- **Lista de tipos de branch duplicada** entre `_git_branch_prefix`
  (`lib/git/helpers.sh:12-20`) e o array `types=(...)` em
  `lib/git/new/helpers.sh:18` — adicionar um tipo novo exige lembrar de
  editar os dois lugares.

#### A.2 Funções longas / com responsabilidades demais

- `_detect_projects_scan` (`lib/projects/detect.sh:64-138`, ~75 linhas): scan
  de diretório + detecção de tipo + alocação de porta livre (busca O(n²) por
  projeto) + detecção de webpack/mysql, tudo numa função.
- `dev-start-all` (`lib/server/core/commands.sh:170-257`, ~88 linhas) mistura
  iteração de projetos, lógica Rails, lógica Node com módulo carregado e um
  "modo degradado" Node sem `_node_server_start` que reimplementa detecção de
  gerenciador de pacotes — esse último ramo (linhas 214-244) parece código
  morto na prática, já que `lib/node/init.sh` é sempre carregado por
  `init.sh:111`. Vale confirmar e remover se confirmado.
- `project-menu` e `dev-project-actions` (`lib/ui/menu.sh`): cada uma mistura
  montagem de dados, renderização gum, renderização texto puro e parsing de
  escolha na mesma função — vale separar "monta opções" de "renderiza".
- `_undo_select_files` (`lib/git/undo/helpers.sh:11-98`) mistura parsing de
  `git status --porcelain`, dois modos de interação e parsing de seleção
  múltipla (`1,3,5`/`all`) numa função só.

#### A.3 Tratamento de erro inconsistente/ausente

- Variáveis de loop sem `local` vazam para o shell interativo do usuário:
  `p` em `dev-stop-all` (`lib/server/core/commands.sh:108`), `entry` em
  `_undo_confirm_restore`/`_undo_restore_files`
  (`lib/git/undo/helpers.sh:105,124`), e o mesmo padrão em vários `for opt`/
  `for f`/`for idx` de arquivos de menu.
- **`local x=$(cmd)` mascarando código de saída (SC2155)** confirmado em:
  `lib/git/switch/helpers.sh:6`, `lib/git/tools/helpers.sh:7`,
  `lib/git/delete/helpers.sh:62`, `lib/rails/generators/model.sh:25`,
  `lib/rails/generators/scaffold.sh:25`, `lib/rails/generators/migration.sh:18`,
  `lib/rails/tests/run_selected.sh:7` — nenhum desses detecta falha do
  comando interno.
- **Ramo inalcançável** em `lib/git/commit/helpers.sh:44-51`: dentro do
  `else` de "gum ausente" há um segundo `if _dev_has gum; then ...` que nunca
  pode ser verdadeiro — a chamada `gum style` (linha 48) é código morto.
- `dev-stop` (`lib/server/core/commands.sh:76-85`): `pids=$(lsof -t -i
  :"$port")` não é aspeado no `for pid in $pids` — funciona só por
  convenção, seria mais seguro com array via `readarray`.
- `_dev_detect_adapter`/`_dev_database_port`
  (`lib/rails/database/helpers.sh:5-19`) dependem implicitamente de o
  chamador já ter feito `cd` para o projeto (usam caminho relativo
  `config/database.yml`), sem nenhuma validação defensiva nem teste que
  force isso — um refactor futuro que remova o `_dev_cd` de algum caller
  quebra silenciosamente.

#### A.4 Quoting, `eval`, `cd`

- Nenhum uso de `eval` no código — positivo.
- `_dev_cd` é usado consistentemente com checagem de erro — positivo.
- **Padrão "monta string de comando e roda via `bash -c \"\$cmd\"`"
  confirmado 29 vezes em 17 arquivos** (`lib/server/core/start.sh:62`,
  consoles Rails, `lib/rails/tests/helpers.sh`, `lib/git/status/helpers.sh`,
  `lib/git/log/helpers.sh`, `lib/git/publish|update|sync/run.sh`,
  `lib/node/deps/run.sh`, `lib/rails/webpack/start.sh`,
  `lib/rails/database/service.sh`, `lib/rails/sidekiq/*.sh`). Caso mais
  notável: `_show_diff` (`lib/git/status/helpers.sh:105-113`) monta
  `cmd="$diff_cmd --color=always -- \"$file\""` por interpolação — se
  `$file` contiver `"`, quebra ou reinterpreta o comando. O próprio código já
  conhece o padrão seguro (`_save_commit`, `lib/git/save/helpers.sh:19`, usa
  argumento posicional em vez de interpolação), só não é aplicado em todo
  lugar. `_dev_start_server` (`lib/server/core/start.sh:62`, o ponto central
  de start de qualquer servidor) tem o mesmo padrão. **Sugestão:** montar
  comandos como arrays (`cmd=(bin/rails server -p "$port" -b 0.0.0.0)`) e
  executar `"${cmd[@]}"` — alinhando com `packages/process-manager`, que já
  evita `shell: true` deliberadamente por segurança.

#### A.5 Convenção de nomes

- `project-*` (`project-path`, `project-type`, `project-port`, `project-list`
  etc., em `lib/projects/accessors.sh`/`list.sh`) usa a convenção "pública
  com hífen" mesmo sendo, na prática, acessores internos entre módulos, nunca
  chamados diretamente por um humano — mistura API pública com API interna
  sob a mesma nomenclatura.
- `detect_projects`, `load_project_config` (`lib/projects/detect.sh:44`,
  `lib/projects/config.sh:6`) não seguem nem `_dev_*`/`_project_*` (privado)
  nem `dev-*` (público) — um terceiro estilo.
- `_is_port_in_use`, `_kill_port`, `_wait_for_port`, `_check_port` (todos em
  `lib/server/core/*.sh`) não têm o prefixo de domínio `_server_*` que os
  demais submódulos usam (`_git_*`, `_project_*`, `_new_*`, `_node_*`).
- Dois frameworks de teste convivem sem estar ambos documentados: os `.bats`
  (`lib/git/git-helpers.bats`, `lib/rails/rails-helpers.bats`) e o framework
  próprio em `tests/cli/` — só o segundo é mencionado no `CLAUDE.md`/
  `tests/cli/README.md`, e os `.bats` **não rodam no CI**.

#### A.6 Código morto / comentários obsoletos

- Nenhum `TODO`/`FIXME`/`HACK`/`XXX` no código — positivo, backlog fica em
  `tasks/`.
- Ramo inalcançável em `lib/git/commit/helpers.sh:47-51` (ver A.3).
- Fallback provavelmente morto: bloco Node sem `_node_server_start` em
  `dev-start-all` (ver A.2).
- `config/projects.conf` documenta um "formato avançado (ainda não
  implementado, mas planejado)" sem código correspondente — confirmar se
  ainda é plano vivo ou mover a intenção para `tasks/`.
- `lib/ui/helpers.sh` é "mantido por compatibilidade" segundo o próprio
  comentário, mas nada impede/avisa uso da versão obsoleta — melhor fazer
  `_dev_get_branch_info` delegar para `_dev_repo_label`.

#### A.7 Cobertura de testes (`tests/cli/`)

Funções puras (sem `gum`/`read`) sem teste correspondente em
`tests/cli/cases/*.sh`:
- `_dev_port_open` (`lib/core/services.sh:5-8`)
- `_is_port_in_use` / `_kill_port` / `_check_port`
  (`lib/server/core/helpers.sh`, `lib/server/core/wait_port.sh`)
- `_dev_detect_adapter` / `_dev_database_port`
  (`lib/rails/database/helpers.sh:5-19`) — parsing puro de
  `config/database.yml`, caso ideal para teste (mysql2→3306,
  postgresql→5432, sem adapter→vazio)
- `_dev_project_id` — variações com acento/Unicode (fora de
  `[A-Za-z0-9-]`) não parecem cobertas
- `_undo_get_files` (`lib/git/undo/helpers.sh:6-9`) — parsing puro de `git
  status --porcelain`

#### A.8 Portabilidade (bashisms, GNU vs BSD)

- **`find ... -printf` é GNU-only**, usado sem fallback em
  `lib/node/server/helpers.sh:16` (`_node_list_envs`) e
  `lib/rails/database/restore.sh:15` (`_dev_db_restore`) — em macOS/BSD
  falha silenciosamente (`2>/dev/null` engole o erro) e ambas as funções
  reportam "nada encontrado" mesmo havendo arquivos. O padrão correto já
  existe no código (`_detect_mtime` em `lib/projects/cache.sh:15`, e
  `lib/core/secrets.sh:7`, ambos com `stat -c ... || stat -f ...`) — só não
  foi replicado nesses dois pontos.
- `readarray`/`mapfile` (22 ocorrências) exige Bash ≥ 4, coerente com o
  requisito checado por `dev-doctor`, mas vale documentar explicitamente que
  usuários Mac precisam instalar bash via Homebrew (o bash 3.2 pré-instalado
  não serve).

#### A.9 Configuração hardcoded vs configurável

- Fallback de `DEV_BASE` para `$HOME/Caiena/Projetos` (específico de uma
  empresa) duplicado em 4 lugares: `init.sh:40`, `lib/projects/detect.sh:46,66`,
  `lib/projects/cache.sh:25`. Sugestão: centralizar numa única constante.
- `~/.dev-dashboard/config/projects.conf` tem caminho fixo
  (`lib/projects/config.sh:7`, `lib/projects/cache.sh:28`), enquanto
  `DEV_DASHBOARD_DIR` (onde o código mora) é resolvido dinamicamente — duas
  fontes de verdade para "onde fica o `.dev-dashboard`", contrato não
  documentado.
- `sleep 3` hardcoded como tempo de exibição de erro, repetido 96 vezes sem
  nenhuma constante central (`DEV_ERROR_PAUSE_SECS`, por exemplo).
- Portas MySQL (3306) e Postgres (5432) hardcoded em
  `lib/rails/database/helpers.sh:15-16` e `lib/core/services.sh:11`, sem
  possibilidade de override para instâncias em porta não-padrão.

#### A.10 Outros achados

- **`export -f` redundante entre `init.sh` e os loaders de módulo:**
  `init.sh:135-138` mantém uma lista central de `export -f` que, na prática,
  já é inteiramente coberta pelo `export -f` de cada módulo individual
  (`lib/server/core/init.sh`, `lib/server/status/init.sh`,
  `lib/server/logs/init.sh`, `lib/projects/init.sh`, `lib/dashboard/init.sh`,
  `lib/doctor/init.sh`, `lib/actions/init.sh`). Pior: `dev-restart` e
  `dev-start-all` (exportadas corretamente pelo módulo) **não aparecem** na
  lista central — se algum dia a exportação do submódulo for removida
  assumindo que a central cobre, a função quebra em subshells. Sugestão:
  remover a lista central redundante.
- **`dev-help` desatualizado:** `dev-rails-menu`, `dev-node-menu` e
  `project-databases` são exportados como comandos públicos
  (`init.sh:137`) mas não aparecem em `dev-help` (`lib/doctor/help.sh`).
- **Roteamento por string de label de UI:** `dev-run-command`
  (`lib/dashboard/router.sh:13-61`) despacha comparando as strings exatas do
  menu (`"Comandos Rails"`, etc.) montadas em `lib/ui/menu.sh` — qualquer
  mudança de copy quebra o roteamento silenciosamente (cai no `*)` default
  sem erro de carregamento). Sugestão: IDs internos estáveis separados do
  texto exibido.
- **Sem `shellcheck` no CI** — o lado TypeScript tem `lint`/`format:check`
  automatizados; o CLI bash (~185 arquivos, onde ocorrem os SC2155 e
  problemas de quoting citados acima) não tem rede de segurança automatizada.

**Prioridades sugeridas (CLI bash):** 1) consolidar as 5 implementações de
"porta em uso"; 2) extrair `_dev_confirm`; 3) adicionar `tests/cli/run.sh`
(e decidir o destino dos `.bats`) ao CI; 4) trocar `bash -c "$cmd_string"`
por arrays de comando, começando por `_dev_start_server`/`_show_diff`; 5)
remover a lista redundante de `export -f` em `init.sh` e atualizar
`dev-help`; 6) corrigir os dois usos de `find -printf` para macOS/BSD; 7)
adicionar `shellcheck` ao CI.

---

### B. Monorepo web (`apps/`, `packages/`)

Observação geral: `tsconfig.base.json` já usa `strict`,
`noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`; não há uso de
`any` nem `TODO`/`FIXME` em `apps/api/src`, `apps/web/src` ou
`packages/*/src`, e a cobertura de testes é boa na maior parte dos pacotes.
Os pontos abaixo são refinamentos sobre uma base já sólida.

#### B.1 `runGit` reimplementado em 11 lugares diferentes — resolvido (2026-08-07)

Extraído `apps/api/src/services/shared/run-git.ts` como único ponto que
efetivamente dispara `execFile('git', ...)`: agora define
`GIT_TERMINAL_PROMPT: '0'` e `GCM_INTERACTIVE: 'Never'` em todo lugar (o
risco real de travar o processo esperando um prompt de credencial
interativo), além de `timeoutMs`/`maxBufferBytes` parametrizáveis e
`commandFailureText`/`optionalGit`/`runProviderCli` centralizados.
`git-service/run.ts`, `git-undo/run.ts`, `git-sync/run.ts`,
`git-commit-details/run.ts` e `git-pull-request/run.ts` passaram a
reexportar ou delegar para o módulo compartilhado; os seis serviços que
tinham `runGit` local (`git-workspace-service.ts`, `git-branch-service.ts`,
`git-branch-delete-service.ts`, `git-branch-rename-service.ts`,
`git-current-branch-history-service.ts`,
`git-exclusive-branch-history-service.ts`) mantiveram wrappers finos só
para preservar `trim()`/`maxBuffer` específicos de cada um, delegando a
chamada real ao módulo compartilhado.

#### B.2 Lógica de path traversal triplicada — resolvido (2026-08-07)

Extraído `apps/api/src/services/shared/path-guards.ts` com
`isPathWithinRoot` (baseado em `path.relative`, como a variante que já
existia em `workspaces.ts`), `isIgnoredProjectPath` e
`isSensitiveProjectPath` como único ponto de verdade. `project-file-service.ts`,
`project-file-mutation-service.ts`, `project-language-server-service.ts` e
`apps/api/src/routes/workspaces.ts` passaram a importar dali em vez de
manter cópias locais divergentes (`isWithinRoot`/`isIgnoredPath`/
`isPathInside`).

#### B.3 `apps/api/src/security/local-security.ts` — resolvido (2026-08-07)

- ~~`sessionSecret = options.sessionSecret ?? options.token`, replicado em
  `app.ts:124`: quando não há `sessionSecret` configurado, o HMAC de sessão
  do navegador usa o próprio token de autenticação como chave~~ — agora
  `registerLocalSecurity` deriva a chave por padrão via
  `deriveSessionSecret` (HMAC-SHA256 do token com um rótulo de domínio
  fixo), mantendo a comparação de token e a assinatura de cookie de sessão
  criptograficamente independentes mesmo partindo do mesmo segredo
  armazenado; `app.ts` não replica mais o fallback, só repassa
  `sessionSecret` quando explicitamente configurado. Teste de regressão em
  `local-security.test.ts` confirma que uma assinatura forjada com o token
  bruto como chave HMAC não valida a sessão.
- ~~Os códigos de erro do `onRequest` hook (`BOOTSTRAP_NOT_ALLOWED`,
  `INVALID_BROWSER_BOOTSTRAP`, `ORIGIN_NOT_ALLOWED`, `ORIGIN_REQUIRED`,
  `SESSION_EXPIRED`, `INVALID_LOCAL_TOKEN`) eram strings soltas fora do
  union `ApiErrorCode`~~ — agora fazem parte do union e as respostas são
  montadas por um helper local (`sendApiError`) tipado contra
  `ApiErrorCode`, sem depender de lançar `ApiError`/`registerApiErrorHandling`
  (este módulo é testado de forma isolada, só com Fastify puro, antes do
  error handler global existir necessariamente).

#### B.4 `apps/api/src/http/api-error.ts`

`ApiErrorCode` é um union manual com mais de 150 variantes — sem problema
funcional, mas frágil de manter. Vale considerar particionar por domínio
(`GitApiErrorCode`, `RailsApiErrorCode`, ...) unidos via union.

#### B.5 `apps/api/src/store/project-store.ts` — resolvido (2026-08-07)

- ~~`findProject` reconstrói `listProjects()` inteiro (percorre todos os
  scans) só para achar um projeto por id~~ / ~~`updateProject` percorre
  todos os `workspaceScans`/`projects` a cada chamada de
  `setFavorite`/`setLastAccessedAt`~~ — adicionado um índice incremental
  `Map<projectId, Set<workspaceId>>` (`projectWorkspaces`), mantido em
  `saveWorkspaceScan`/`deleteWorkspaceScan` sem remover-e-readicionar
  associações que persistem entre scans (preserva a ordem que
  `updateProject` usa para decidir qual ocorrência retornar quando um
  projeto aparece em mais de um workspace). `findProject`/`updateProject`
  agora só tocam os scans que de fato contêm o projeto, em vez de
  `O(total de projetos em todos os workspaces)`. Testes cobrindo rescan
  que remove um projeto, `deleteWorkspaceScan`, e um projeto que some e
  reaparece entre scans.

#### B.6 `packages/core` — concorrência inconsistente entre repositórios

- `ProjectFavoriteRepository`/`ProjectRecentRepository` usam cache em
  memória + `mutationQueue` para serializar escritas.
- ~~`WorkspaceRepository` (`workspace-repository.ts:139-266`) **não tem**
  esse mecanismo~~ — **resolvido (2026-08-07)**: `create`/`setRecursiveScan`/
  `remove` agora passam pelo mesmo `mutationQueue`/`enqueue<T>` usado em
  `ProjectFavoriteRepository`/`EnvironmentProfileRepository`, serializando o
  ler-modificar-escrever. Teste de regressão em
  `workspace-repository.test.ts` dispara 8 `create()` concorrentes na mesma
  instância e confirma que nenhum é perdido (falhava com `ENOENT` no
  `rename()` antes da correção, por duas escritas colidirem no mesmo
  arquivo temporário).
- `state-file-recovery.ts:17-33` usa `existsSync`/`copyFileSync` síncronos
  num codebase inteiramente assíncrono — bloqueia o event loop no caso raro
  de arquivo corrompido.
- Duplicação conceitual: `ProjectRecentRepository` e o `ProjectStore` em
  memória guardam `lastAccessedAt` cada um a seu modo — duas fontes da mesma
  informação, risco de dessincronia.

#### B.7 `packages/process-manager`

- ~~`process-store.ts:62-66,137-141` lança exceção em arquivo de estado
  corrompido~~ — **resolvido (2026-08-07)**: `readStoredProcess` e
  `listStoredProcessEntries` agora tratam JSON corrompido/formato
  inesperado como o mesmo caso de "arquivo ausente" (retornam `null`/pulam
  a entrada) em vez de lançar, e movem o arquivo para uma cópia
  `.unreadable-<timestamp>.bak` antes — mesmo padrão de
  `quarantineUnreadableStateFile` de `packages/core`, replicado localmente
  em `state-file-recovery.ts` porque `process-manager` não depende de
  `core`.
- ~~`process-exit-tracking.ts:59-81`: mapas `observedExits`/`exitWaiters` só
  são limpos quando `recordChildExit` completa com sucesso — se o evento
  `exit`/`error` nunca disparar, a entrada fica presa indefinidamente sem
  TTL de expurgo defensivo~~ — **resolvido (2026-08-07)**: `createExitTracker`
  agora aceita um relógio injetável (`now`, padrão `Date.now`) e roda um
  expurgo defensivo (`STALE_ENTRY_TTL_MS` = 10 minutos, bem acima de
  qualquer timeout real de start/stop) a cada novo `observeChild` —
  entradas mais velhas que o TTL são removidas de ambos os mapas. Teste de
  regressão simula um processo cujo `exit`/`error` nunca dispara e confirma
  que a entrada trava até o TTL (sem o expurgo) e é liberada depois dele.
- `port-utils.ts:92-106`: `findAvailablePort` varre portas sequencialmente
  (até 1000 portas no intervalo padrão) — poderia paralelizar em lotes.
- ~~`ManagedKind` (`process-store.ts:12`) não inclui `'script'`, presente em
  `ManagedProcessKind` de `packages/contracts` — inconsistência de tipos
  entre contrato público e cobertura real, vale documentar o
  motivo~~ — **resolvido (2026-08-07)**: intencional, não é lacuna — scripts
  têm ciclo de vida e persistência próprios em
  `apps/api/src/services/script-execution/`, independentes do
  `ProcessStore`. Documentado com comentário no tipo `ManagedKind`.
  Aproveitado para também consolidar os três regex `.(server|test|worker|
  webpack)` duplicados entre `process-store.ts` e `log-retention.ts` (o
  "regex de `sweepStaleProcesses`" citado na nota de arquitetura sobre
  generalizar um novo `kind`) numa única lista `MANAGED_KINDS`, para os
  dois nunca divergirem silenciosamente. Teste novo cobre
  `sweepStaleProcesses` para um processo `webpack` (só `server` era
  exercitado antes).

#### B.8 `packages/project-discovery/src/discovery.ts`

- ~~Duplicação significativa (~50 linhas) entre a varredura recursiva
  (`walkForProjects`) e a não-recursiva dentro de `scanWorkspace` — mesmo
  filtro de diretórios ignorados, mesma detecção, mesmo padrão de
  warning~~ — **resolvido (2026-08-07)**: `scanWorkspace` agora sempre
  chama `walkForProjects`, com a varredura não-recursiva montando um
  `WalkContext` com `maxDepth: 0`, sem os limites de projetos/tempo da
  varredura recursiva (`maxProjects`/`deadlineAt` como `Infinity`) e
  seguindo símlinks de topo (`followSymlinks: true`), que era o
  comportamento implícito da versão não-recursiva antiga. Um novo campo
  `reportDepthLimit` no contexto evita que subdiretórios não explorados no
  nível único virem aviso `SCAN_DEPTH_LIMIT_REACHED` — isso só é reportado
  na varredura recursiva de verdade. Teste novo trava que a varredura
  não-recursiva continua seguindo símlinks de topo (comportamento que só
  existia implicitamente, sem cobertura, antes da unificação).
- Ambas processam candidatos sequencialmente (`for...of` com `await`
  dentro), serializando I/O que poderia rodar com `Promise.all` limitado —
  não mexido nesta entrega: a varredura recursiva depende da checagem
  incremental de `maxProjects`/timeout a cada candidato, então paralelizar
  exigiria repensar esse controle de parada antecipada, não é uma
  mudança pontual.

#### B.9 `apps/api/src/app-context.ts`

- ~~`AiAssistantService` tem 5 parâmetros posicionais com `fetchImpl` no
  meio, obrigando `app-context.ts:130-136` a passar `undefined` explícito
  só para preencher a posição~~ — **resolvido (2026-08-07)**: o construtor
  agora recebe um único `AiAssistantServiceOptions` nomeado
  (`projectFileService`/`gitService`/`fetchImpl`/`workspaceEditService`/
  `languageServerService`, todos opcionais); `app-context.ts` só passa os
  campos que de fato substitui, sem `undefined` de preenchimento.
- `createAppContext()` é uma raiz de composição manual de ~25 serviços sem
  DI, com dependências de ordem implícitas (não documentadas) entre alguns
  deles.

#### B.10 `apps/web/src` — "enhancers" DOM fora da árvore Vue

`main.ts:27-66` registra 17 módulos "enhancer" que manipulam o DOM
diretamente via `MutationObserver`/`querySelectorAll` fora do Vue (mais de
60 arquivos entre `git-summary-history/*`, `git-summary-inline-diff-fix/*`,
`log-detail/*`, `log-visual/*`, `test-log-inspector/*`, etc.):

- Múltiplos `MutationObserver`s independentes observam
  `document.documentElement` com `subtree: true` simultaneamente — custoso e
  difícil de depurar; a ordem de registro em `main.ts` importa mas não é
  documentada/garantida.
- Cobertura de teste desigual: `git-summary-history-enhancer.ts` e
  `git-summary-inline-diff-fix.ts` (e submódulos) não têm nenhum teste
  correspondente, enquanto enhancers similares (`log-visual-enhancer`,
  `test-log-inspector`) têm.
- Sugestão de médio/longo prazo: migrar progressivamente para
  componentes/composables Vue nativos, ou ao menos consolidar num único
  `MutationObserver` compartilhado com pipeline de decoradores.

#### B.11 Padrão `RequestGeneration`/`RequestGate` aplicado de forma inconsistente — revisado (2026-08-07)

A lista original desta varredura estava desatualizada: `useProjectDatabaseOverview.ts`,
`useProjectDatabaseSnapshots.ts`, `useRailsMigrations.ts`, `useRailsModels.ts`,
`useScriptCatalog.ts`, `useProjectGitPanel.ts` e `useProjectTestProcess.ts` **já**
guardam contra resposta fora de ordem (contador `generation` manual ou
`AbortController`); `useProjectScriptsPanel.ts` não precisa de guarda própria
porque delega inteiramente a `useScriptCatalog`/`useScriptExecution`, que já
guardam. Revisão completa achou 3 gaps reais, todos corrigidos com o mesmo
idioma já usado no restante do arquivo (contador `generation` local, ou
`AbortController` quando o arquivo já usava esse padrão para outras
chamadas):

- `useProjectGitDiffPage.ts`: `loadOverview()` não tinha guarda (ao contrário
  de `loadSnapshot()`, que já usa `AbortController`) — numa troca rápida de
  projeto, o overview (branch exibida no cabeçalho) podia ficar preso no
  projeto anterior.
- `useProjectGitHistoryPage.ts`: mesmo gap em `loadWorkspace()` (lista de
  branches do seletor), ao contrário de `loadHistory()`/`openCommit()`.
- `useRailsGenerator.ts`: sem guarda nenhuma — `reset()` (chamado pelo
  componente ao trocar de projeto) não cancelava uma preparação/confirmação
  em andamento, então a resposta atrasada reescrevia `pendingConfirmation`/
  `result` com dados do projeto errado, e `preparing`/`running` podiam ficar
  presos em `true` indefinidamente. Corrigido com um contador `generation`
  e `reset()` agora também limpa `preparing`/`running`.

Teste de regressão para cada um em `apps/web/test/` reproduz a falha antes
do fix (resposta atrasada de um projeto sobrescrevendo o projeto atual) e
passa depois.

#### B.12 Componentes/composables grandes demais

| Arquivo | Linhas |
|---|---|
| ~~`apps/web/src/components/ProjectEmbeddedEditor.vue`~~ | ~~1814~~ |
| `apps/web/src/components/EnvironmentProfilesPanel.vue` | 987 |
| `apps/web/src/components/ProjectGitMutationHistoryPage.vue` | 754 |
| `apps/web/src/components/ProjectReadmePanel.vue` | 720 |
| `apps/web/src/components/ProjectGitPullRequestPage.vue` | 702 |
| `apps/web/src/components/ProjectRailsRuntimePanel.vue` | 681 |
| `apps/web/src/composables/useProjectGitDiffPage.ts` | 638 |
| `apps/web/src/composables/useProjectGitPanel.ts` | 628 |
| `apps/web/src/composables/useProjectTestsPanel.ts` | 595 |
| `apps/web/src/components/ProjectScriptsPanel.vue` | 592 |
| `apps/web/src/composables/useProjectGitHistoryPage.ts` | 587 |

`ProjectEmbeddedEditor.vue` — resolvido (2026-08-09): o arquivo não existe
mais, removido junto com a IDE embutida no PR #262 ("remove embedded
editor"). O maior candidato a decomposição hoje é
`EnvironmentProfilesPanel.vue`.

#### B.13 `apps/web/src/language-server/project-language-server-client.ts` — resolvido (2026-08-09)

~~Usa `as unknown as LspRange` em código de produção (linhas 429, 873, 1015,
1077, 1079, 1083) para converter ranges do Monaco para tipos LSP — diferente
do resto do frontend, onde esse tipo de asserção só aparece em testes/mocks.
Como os dois tipos usam convenções de índice diferentes (0-based vs
1-based), um cast direto esconde a ausência de conversão real. Sugestão:
função explícita `toLspRange`/`fromLspRange`.~~ — todo o diretório
`apps/web/src/language-server/` foi removido junto com a IDE embutida no PR
#262 ("remove embedded editor"); o arquivo não existe mais.

#### B.14 `packages/contracts` — resolvido (2026-08-07)

~~`ManagedProcess.exitCode?: number` não distingue `null`, enquanto
`process-manager` circula `exitCode` como `number | null | undefined` em
vários pontos — vale alinhar o contrato público ou documentar a normalização
feita na fronteira~~ — confirmado que não é uma inconsistência real: o
`null` (valor bruto de `child.exitCode` do Node quando o processo morre por
sinal) só existe na parte interna e transitória de `process-exit-tracking.ts`
(`ObservedExit`, `recordChildExit`). `terminalProcess`
(`process-store.ts`) é a fronteira que normaliza — omite o campo
`exitCode` inteiramente quando é `null`/`undefined`, em vez de propagar
`null` — e `isStoredProcess` já valida que um `StoredProcess` persistido
nunca tem `exitCode: null`. Documentado com comentários nos dois pontos.

#### B.15 Configuração/build

`package.json` raiz declara `"@types/node": "^26.1.1"`, incompatível com o
`engines.node` declarado (`^20.19.0 || >=22.12.0`) — conferir se é
intencional ou atualização automática indevida.

#### B.16 Cobertura de testes — lacunas específicas

- `packages/core/test/workspace-repository.test.ts` não cobre concorrência
  de escrita (relacionado a B.6).
- Módulos "enhancer" `git-summary-history-enhancer.ts`,
  `git-summary-inline-diff-fix.ts` (e submódulos) sem teste direto (B.10).
- `packages/process-manager`: sem teste dedicado confirmado para
  `port-utils.ts` (`findAvailablePort`, `canListen`, `canConnect`,
  `listServerUrls`) nem `command-resolution.ts` — conferir se são
  exercitados indiretamente ou ficam sem cobertura direta.

**Prioridades sugeridas (web):** 1) decompor componentes grandes (B.12);
avaliar migração gradual dos "enhancers" DOM (B.10).
