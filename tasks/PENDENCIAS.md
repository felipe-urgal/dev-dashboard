# Atividades pendentes

InventÃ¡rio do que ainda falta implementar no Dev Dashboard. Este documento
lista sÃ³ trabalho em aberto; itens concluÃ­dos ficam registrados em
`tasks/<NNN>-*.md` â `docs/` guarda apenas documentaÃ§Ã£o viva do produto, nÃ£o
o histÃ³rico de entregas.

## Regras para qualquer entrega

O Dev Dashboard evolui sem interromper o CLI Bash. Toda entrega web deve manter
a API em `127.0.0.1`, usar catÃ¡logo fechado de aÃ§Ãµes, receber apenas IDs e
valores validados do navegador e preservar schemas explÃ­citos de resposta.

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
status do processo gerenciado a cada 5s indefinidamente, mesmo com o processo parado hÃ¡ horas â
sem desacelerar nem parar. PadrÃ£o consistente nos dois lugares (nÃ£o Ã© bug isolado do Sidekiq,
achado ao investigar o painel), provavelmente proposital (detectar se algo iniciar o processo por
fora do dashboard). Vale reavaliar como uma frente prÃ³pria â mudar sÃ³ um painel criaria
inconsistÃªncia com o outro; mudar os dois Ã© escopo maior que uma correÃ§Ã£o pontual.

## ValidaÃ§Ã£o manual da Code review com IA local

> **2026-08-12:** a aba **Assistente IA** (task 232) e toda a infraestrutura de
> seleÃ§Ã£o de provider/consentimento cloud (multi-provider Ollama/OpenAI) foram
> removidas â decisÃ£o explÃ­cita do usuÃ¡rio, ver
> [`238-remover-assistente-ia.md`](238-remover-assistente-ia.md). O item de
> validaÃ§Ã£o manual do Assistente IA abaixo nÃ£o se aplica mais; a Code review
> segue existindo, agora fixa no Ollama local.

- Validar a task 233 em uma revisÃ£o com comentÃ¡rios distribuÃ­dos por mais de
  um arquivo, conferindo o diff lado a lado e as aÃ§Ãµes de triagem.

---

## Varredura de melhorias e refatoraÃ§Ã£o (2026-08-06)

Levantamento produzido por uma varredura completa do repositÃ³rio, cobrindo as
duas interfaces (CLI bash em `lib/` e o monorepo web em `apps/`/`packages/`).
SÃ£o sÃ³ oportunidades de melhoria/refatoraÃ§Ã£o â nada aqui bloqueia uso atual do
projeto. Prioridades sugeridas ao final de cada bloco.

### A. CLI bash (`lib/`, `init.sh`, `tests/cli/`)

#### A.1 DuplicaÃ§Ã£o de cÃ³digo entre mÃ³dulos

- **ConfirmaÃ§Ã£o gum vs texto puro duplicada ~28 vezes.** O padrÃ£o
  `if _dev_has gum; then gum confirm ...; else read -r -p "...(s/N)"; fi` se
  repete literalmente em 21 arquivos (`lib/git/*/helpers.sh`,
  `lib/rails/database/*.sh`, `lib/rails/bundler/run.sh`,
  `lib/node/deps/run.sh`, `lib/backup/run.sh`, `lib/server/core/start.sh`
  etc.). JÃ¡ existe `_dev_pause` (`lib/core/interaction.sh:5`) como precedente
  de helper compartilhado gum/texto puro, mas nunca foi criado o equivalente
  `_dev_confirm "mensagem"`. **SugestÃ£o:** extrair para
  `lib/core/interaction.sh`.
- **Menu gum table vs numeraÃ§Ã£o manual duplicado em ~15+ lugares.**
  `_dev_has gum` aparece em 82 arquivos; o esqueleto "monta linhas
  `;`-separadas â `gum table`/`gum choose` â senÃ£o itera com Ã­ndice numÃ©rico
  â `read` â valida `^[0-9]+$`" se repete quase idÃªntico em
  `lib/ui/menu.sh:6-97` (`project-menu`), `lib/ui/menu.sh:99-166`
  (`dev-project-actions`), `lib/git/status/helpers.sh:34-62`,
  `lib/rails/menu/helpers.sh`, `lib/rails/database/menu.sh`,
  `lib/node/menu/helpers.sh`, `lib/rails/generators/menu.sh`,
  `lib/rails/webpack/helpers.sh`, `lib/rails/sidekiq/helpers.sh`,
  `lib/rails/tests/menu.sh`, `lib/rails/assets/menu.sh`. **SugestÃ£o:**
  `_dev_menu_select "TÃ­tulo" "opÃ§Ã£o1" "opÃ§Ã£o2" ...`.
- **Boilerplate "resolver path do projeto ou abortar" repetido 21 vezes,
  idÃªntico** (`lib/rails/routes/run.sh:6-13`, `lib/rails/bundler/run.sh:6-13`,
  `lib/node/deps/run.sh:6-13` e outros 18 arquivos):
  ```bash
  path=$(project-path "$project") || {
    _dev_err "Projeto '$project' nÃ£o encontrado."
    sleep 3
    return 1
  }
  _dev_cd "$path" || return 1
  ```
  **SugestÃ£o:** `_dev_enter_project "$project" || return 1`.
- **VerificaÃ§Ã£o de "porta em uso" implementada cinco vezes diferentes**, com
  robustez divergente: `_is_port_in_use()` (`lib/server/core/helpers.sh:10`,
  sÃ³ `lsof`), `_dev_port_open()` (`lib/core/services.sh:5`, mesma lÃ³gica,
  outro nome), `_check_port()` (`lib/server/core/wait_port.sh:5-11`, com
  fallback `ss`/`netstat`), uma quarta cÃ³pia inline dentro de um heredoc
  `bash -c "..."` no mesmo arquivo (linhas 21-28), e `_dev_database_running()`
  (`lib/rails/database/helpers.sh:43-62`) com fallback adicional via `pgrep`.
  Como `dev-doctor` exige `lsof` mas as duas primeiras nÃ£o tÃªm fallback
  `ss`/`netstat`, o comportamento diverge entre mÃ³dulos mesmo em ambientes
  onde o usuÃ¡rio ignorou o aviso do doctor. **SugestÃ£o:** consolidar num sÃ³
  `_dev_port_open "$port"` em `lib/core/services.sh` com os 3 fallbacks.
- **`_dev_get_branch_info` (`lib/ui/helpers.sh:7-19`) duplica
  `_dev_repo_label` (`lib/core/breadcrumb.sh:11-22`)** â o prÃ³prio comentÃ¡rio
  do arquivo admite que Ã© "mantido por compatibilidade" e que a lÃ³gica real
  vive na outra funÃ§Ã£o, mas nunca foi convertido num wrapper; risco de as
  duas divergirem se uma for corrigida e a outra nÃ£o.
- **Wrappers vazios sem propÃ³sito** em `lib/git/new/helpers.sh:6-8`
  (`_new_show_header`, `_new_step`, `_new_clear` sÃ³ repassam para
  `_dev_breadcrumb`/`_dev_step`/`_dev_clear`) â inconsistente com
  `rails/*`/`node/*`, que chamam os helpers de core diretamente.
- **Lista de tipos de branch duplicada** entre `_git_branch_prefix`
  (`lib/git/helpers.sh:12-20`) e o array `types=(...)` em
  `lib/git/new/helpers.sh:18` â adicionar um tipo novo exige lembrar de
  editar os dois lugares.

#### A.2 FunÃ§Ãµes longas / com responsabilidades demais

- `_detect_projects_scan` (`lib/projects/detect.sh:64-138`, ~75 linhas): scan
  de diretÃ³rio + detecÃ§Ã£o de tipo + alocaÃ§Ã£o de porta livre (busca O(nÂ²) por
  projeto) + detecÃ§Ã£o de webpack/mysql, tudo numa funÃ§Ã£o.
- `dev-start-all` (`lib/server/core/commands.sh:170-257`, ~88 linhas) mistura
  iteraÃ§Ã£o de projetos, lÃ³gica Rails, lÃ³gica Node com mÃ³dulo carregado e um
  "modo degradado" Node sem `_node_server_start` que reimplementa detecÃ§Ã£o de
  gerenciador de pacotes â esse Ãºltimo ramo (linhas 214-244) parece cÃ³digo
  morto na prÃ¡tica, jÃ¡ que `lib/node/init.sh` Ã© sempre carregado por
  `init.sh:111`. Vale confirmar e remover se confirmado.
- `project-menu` e `dev-project-actions` (`lib/ui/menu.sh`): cada uma mistura
  montagem de dados, renderizaÃ§Ã£o gum, renderizaÃ§Ã£o texto puro e parsing de
  escolha na mesma funÃ§Ã£o â vale separar "monta opÃ§Ãµes" de "renderiza".
- `_undo_select_files` (`lib/git/undo/helpers.sh:11-98`) mistura parsing de
  `git status --porcelain`, dois modos de interaÃ§Ã£o e parsing de seleÃ§Ã£o
  mÃºltipla (`1,3,5`/`all`) numa funÃ§Ã£o sÃ³.

#### A.3 Tratamento de erro inconsistente/ausente

- VariÃ¡veis de loop sem `local` vazam para o shell interativo do usuÃ¡rio:
  `p` em `dev-stop-all` (`lib/server/core/commands.sh:108`), `entry` em
  `_undo_confirm_restore`/`_undo_restore_files`
  (`lib/git/undo/helpers.sh:105,124`), e o mesmo padrÃ£o em vÃ¡rios `for opt`/
  `for f`/`for idx` de arquivos de menu.
- **`local x=$(cmd)` mascarando cÃ³digo de saÃ­da (SC2155)** confirmado em:
  `lib/git/switch/helpers.sh:6`, `lib/git/tools/helpers.sh:7`,
  `lib/git/delete/helpers.sh:62`, `lib/rails/generators/model.sh:25`,
  `lib/rails/generators/scaffold.sh:25`, `lib/rails/generators/migration.sh:18`,
  `lib/rails/tests/run_selected.sh:7` â nenhum desses detecta falha do
  comando interno.
- **Ramo inalcanÃ§Ã¡vel** em `lib/git/commit/helpers.sh:44-51`: dentro do
  `else` de "gum ausente" hÃ¡ um segundo `if _dev_has gum; then ...` que nunca
  pode ser verdadeiro â a chamada `gum style` (linha 48) Ã© cÃ³digo morto.
- `dev-stop` (`lib/server/core/commands.sh:76-85`): `pids=$(lsof -t -i
  :"$port")` nÃ£o Ã© aspeado no `for pid in $pids` â funciona sÃ³ por
  convenÃ§Ã£o, seria mais seguro com array via `readarray`.
- `_dev_detect_adapter`/`_dev_database_port`
  (`lib/rails/database/helpers.sh:5-19`) dependem implicitamente de o
  chamador jÃ¡ ter feito `cd` para o projeto (usam caminho relativo
  `config/database.yml`), sem nenhuma validaÃ§Ã£o defensiva nem teste que
  force isso â um refactor futuro que remova o `_dev_cd` de algum caller
  quebra silenciosamente.

#### A.4 Quoting, `eval`, `cd`

- Nenhum uso de `eval` no cÃ³digo â positivo.
- `_dev_cd` Ã© usado consistentemente com checagem de erro â positivo.
- **PadrÃ£o "monta string de comando e roda via `bash -c \"\$cmd\"`"
  confirmado 29 vezes em 17 arquivos** (`lib/server/core/start.sh:62`,
  consoles Rails, `lib/rails/tests/helpers.sh`, `lib/git/status/helpers.sh`,
  `lib/git/log/helpers.sh`, `lib/git/publish|update|sync/run.sh`,
  `lib/node/deps/run.sh`, `lib/rails/webpack/start.sh`,
  `lib/rails/database/service.sh`, `lib/rails/sidekiq/*.sh`). Caso mais
  notÃ¡vel: `_show_diff` (`lib/git/status/helpers.sh:105-113`) monta
  `cmd="$diff_cmd --color=always -- \"$file\""` por interpolaÃ§Ã£o â se
  `$file` contiver `"`, quebra ou reinterpreta o comando. O prÃ³prio cÃ³digo jÃ¡
  conhece o padrÃ£o seguro (`_save_commit`, `lib/git/save/helpers.sh:19`, usa
  argumento posicional em vez de interpolaÃ§Ã£o), sÃ³ nÃ£o Ã© aplicado em todo
  lugar. `_dev_start_server` (`lib/server/core/start.sh:62`, o ponto central
  de start de qualquer servidor) tem o mesmo padrÃ£o. **SugestÃ£o:** montar
  comandos como arrays (`cmd=(bin/rails server -p "$port" -b 0.0.0.0)`) e
  executar `"${cmd[@]}"` â alinhando com `packages/process-manager`, que jÃ¡
  evita `shell: true` deliberadamente por seguranÃ§a.

#### A.5 ConvenÃ§Ã£o de nomes

- `project-*` (`project-path`, `project-type`, `project-port`, `project-list`
  etc., em `lib/projects/accessors.sh`/`list.sh`) usa a convenÃ§Ã£o "pÃºblica
  com hÃ­fen" mesmo sendo, na prÃ¡tica, acessores internos entre mÃ³dulos, nunca
  chamados diretamente por um humano â mistura API pÃºblica com API interna
  sob a mesma nomenclatura.
- `detect_projects`, `load_project_config` (`lib/projects/detect.sh:44`,
  `lib/projects/config.sh:6`) nÃ£o seguem nem `_dev_*`/`_project_*` (privado)
  nem `dev-*` (pÃºblico) â um terceiro estilo.
- `_is_port_in_use`, `_kill_port`, `_wait_for_port`, `_check_port` (todos em
  `lib/server/core/*.sh`) nÃ£o tÃªm o prefixo de domÃ­nio `_server_*` que os
  demais submÃ³dulos usam (`_git_*`, `_project_*`, `_new_*`, `_node_*`).
- Dois frameworks de teste convivem sem estar ambos documentados: os `.bats`
  (`lib/git/git-helpers.bats`, `lib/rails/rails-helpers.bats`) e o framework
  prÃ³prio em `tests/cli/` â sÃ³ o segundo Ã© mencionado no `CLAUDE.md`/
  `tests/cli/README.md`, e os `.bats` **nÃ£o rodam no CI**.

#### A.6 CÃ³digo morto / comentÃ¡rios obsoletos

- Nenhum `TODO`/`FIXME`/`HACK`/`XXX` no cÃ³digo â positivo, backlog fica em
  `tasks/`.
- Ramo inalcanÃ§Ã¡vel em `lib/git/commit/helpers.sh:47-51` (ver A.3).
- Fallback provavelmente morto: bloco Node sem `_node_server_start` em
  `dev-start-all` (ver A.2).
- `config/projects.conf` documenta um "formato avanÃ§ado (ainda nÃ£o
  implementado, mas planejado)" sem cÃ³digo correspondente â confirmar se
  ainda Ã© plano vivo ou mover a intenÃ§Ã£o para `tasks/`.
- `lib/ui/helpers.sh` Ã© "mantido por compatibilidade" segundo o prÃ³prio
  comentÃ¡rio, mas nada impede/avisa uso da versÃ£o obsoleta â melhor fazer
  `_dev_get_branch_info` delegar para `_dev_repo_label`.

#### A.7 Cobertura de testes (`tests/cli/`)

FunÃ§Ãµes puras (sem `gum`/`read`) sem teste correspondente em
`tests/cli/cases/*.sh`:
- `_dev_port_open` (`lib/core/services.sh:5-8`)
- `_is_port_in_use` / `_kill_port` / `_check_port`
  (`lib/server/core/helpers.sh`, `lib/server/core/wait_port.sh`)
- `_dev_detect_adapter` / `_dev_database_port`
  (`lib/rails/database/helpers.sh:5-19`) â parsing puro de
  `config/database.yml`, caso ideal para teste (mysql2â3306,
  postgresqlâ5432, sem adapterâvazio)
- `_dev_project_id` â variaÃ§Ãµes com acento/Unicode (fora de
  `[A-Za-z0-9-]`) nÃ£o parecem cobertas
- `_undo_get_files` (`lib/git/undo/helpers.sh:6-9`) â parsing puro de `git
  status --porcelain`

#### A.8 Portabilidade (bashisms, GNU vs BSD)

- **`find ... -printf` Ã© GNU-only**, usado sem fallback em
  `lib/node/server/helpers.sh:16` (`_node_list_envs`) e
  `lib/rails/database/restore.sh:15` (`_dev_db_restore`) â em macOS/BSD
  falha silenciosamente (`2>/dev/null` engole o erro) e ambas as funÃ§Ãµes
  reportam "nada encontrado" mesmo havendo arquivos. O padrÃ£o correto jÃ¡
  existe no cÃ³digo (`_detect_mtime` em `lib/projects/cache.sh:15`, e
  `lib/core/secrets.sh:7`, ambos com `stat -c ... || stat -f ...`) â sÃ³ nÃ£o
  foi replicado nesses dois pontos.
- `readarray`/`mapfile` (22 ocorrÃªncias) exige Bash â¥ 4, coerente com o
  requisito checado por `dev-doctor`, mas vale documentar explicitamente que
  usuÃ¡rios Mac precisam instalar bash via Homebrew (o bash 3.2 prÃ©-instalado
  nÃ£o serve).

#### A.9 ConfiguraÃ§Ã£o hardcoded vs configurÃ¡vel

- Fallback de `DEV_BASE` para `$HOME/Caiena/Projetos` (especÃ­fico de uma
  empresa) duplicado em 4 lugares: `init.sh:40`, `lib/projects/detect.sh:46,66`,
  `lib/projects/cache.sh:25`. SugestÃ£o: centralizar numa Ãºnica constante.
- `~/.dev-dashboard/config/projects.conf` tem caminho fixo
  (`lib/projects/config.sh:7`, `lib/projects/cache.sh:28`), enquanto
  `DEV_DASHBOARD_DIR` (onde o cÃ³digo mora) Ã© resolvido dinamicamente â duas
  fontes de verdade para "onde fica o `.dev-dashboard`", contrato nÃ£o
  documentado.
- `sleep 3` hardcoded como tempo de exibiÃ§Ã£o de erro, repetido 96 vezes sem
  nenhuma constante central (`DEV_ERROR_PAUSE_SECS`, por exemplo).
- Portas MySQL (3306) e Postgres (5432) hardcoded em
  `lib/rails/database/helpers.sh:15-16` e `lib/core/services.sh:11`, sem
  possibilidade de override para instÃ¢ncias em porta nÃ£o-padrÃ£o.

#### A.10 Outros achados

- **`export -f` redundante entre `init.sh` e os loaders de mÃ³dulo:**
  `init.sh:135-138` mantÃ©m uma lista central de `export -f` que, na prÃ¡tica,
  jÃ¡ Ã© inteiramente coberta pelo `export -f` de cada mÃ³dulo individual
  (`lib/server/core/init.sh`, `lib/server/status/init.sh`,
  `lib/server/logs/init.sh`, `lib/projects/init.sh`, `lib/dashboard/init.sh`,
  `lib/doctor/init.sh`, `lib/actions/init.sh`). Pior: `dev-restart` e
  `dev-start-all` (exportadas corretamente pelo mÃ³dulo) **nÃ£o aparecem** na
  lista central â se algum dia a exportaÃ§Ã£o do submÃ³dulo for removida
  assumindo que a central cobre, a funÃ§Ã£o quebra em subshells. SugestÃ£o:
  remover a lista central redundante.
- **`dev-help` desatualizado:** `dev-rails-menu`, `dev-node-menu` e
  `project-databases` sÃ£o exportados como comandos pÃºblicos
  (`init.sh:137`) mas nÃ£o aparecem em `dev-help` (`lib/doctor/help.sh`).
- **Roteamento por string de label de UI:** `dev-run-command`
  (`lib/dashboard/router.sh:13-61`) despacha comparando as strings exatas do
  menu (`"Comandos Rails"`, etc.) montadas em `lib/ui/menu.sh` â qualquer
  mudanÃ§a de copy quebra o roteamento silenciosamente (cai no `*)` default
  sem erro de carregamento). SugestÃ£o: IDs internos estÃ¡veis separados do
  texto exibido.
- **Sem `shellcheck` no CI** â o lado TypeScript tem `lint`/`format:check`
  automatizados; o CLI bash (~185 arquivos, onde ocorrem os SC2155 e
  problemas de quoting citados acima) nÃ£o tem rede de seguranÃ§a automatizada.

**Prioridades sugeridas (CLI bash):** 1) consolidar as 5 implementaÃ§Ãµes de
"porta em uso"; 2) extrair `_dev_confirm`; 3) adicionar `tests/cli/run.sh`
(e decidir o destino dos `.bats`) ao CI; 4) trocar `bash -c "$cmd_string"`
por arrays de comando, comeÃ§ando por `_dev_start_server`/`_show_diff`; 5)
remover a lista redundante de `export -f` em `init.sh` e atualizar
`dev-help`; 6) corrigir os dois usos de `find -printf` para macOS/BSD; 7)
adicionar `shellcheck` ao CI.

---

### B. Monorepo web (`apps/`, `packages/`)

ObservaÃ§Ã£o geral: `tsconfig.base.json` jÃ¡ usa `strict`,
`noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`; nÃ£o hÃ¡ uso de
`any` nem `TODO`/`FIXME` em `apps/api/src`, `apps/web/src` ou
`packages/*/src`, e a cobertura de testes Ã© boa na maior parte dos pacotes.
Os pontos abaixo sÃ£o refinamentos sobre uma base jÃ¡ sÃ³lida.

#### B.1 `runGit` reimplementado em 11 lugares diferentes â resolvido (2026-08-07)

ExtraÃ­do `apps/api/src/services/shared/run-git.ts` como Ãºnico ponto que
efetivamente dispara `execFile('git', ...)`: agora define
`GIT_TERMINAL_PROMPT: '0'` e `GCM_INTERACTIVE: 'Never'` em todo lugar (o
risco real de travar o processo esperando um prompt de credencial
interativo), alÃ©m de `timeoutMs`/`maxBufferBytes` parametrizÃ¡veis e
`commandFailureText`/`optionalGit`/`runProviderCli` centralizados.
`git-service/run.ts`, `git-undo/run.ts`, `git-sync/run.ts`,
`git-commit-details/run.ts` e `git-pull-request/run.ts` passaram a
reexportar ou delegar para o mÃ³dulo compartilhado; os seis serviÃ§os que
tinham `runGit` local (`git-workspace-service.ts`, `git-branch-service.ts`,
`git-branch-delete-service.ts`, `git-branch-rename-service.ts`,
`git-current-branch-history-service.ts`,
`git-exclusive-branch-history-service.ts`) mantiveram wrappers finos sÃ³
para preservar `trim()`/`maxBuffer` especÃ­ficos de cada um, delegando a
chamada real ao mÃ³dulo compartilhado.

#### B.2 LÃ³gica de path traversal triplicada â resolvido (2026-08-07)

ExtraÃ­do `apps/api/src/services/shared/path-guards.ts` com
`isPathWithinRoot` (baseado em `path.relative`, como a variante que jÃ¡
existia em `workspaces.ts`), `isIgnoredProjectPath` e
`isSensitiveProjectPath` como Ãºnico ponto de verdade. `project-file-service.ts`,
`project-file-mutation-service.ts`, `project-language-server-service.ts` e
`apps/api/src/routes/workspaces.ts` passaram a importar dali em vez de
manter cÃ³pias locais divergentes (`isWithinRoot`/`isIgnoredPath`/
`isPathInside`).

#### B.3 `apps/api/src/security/local-security.ts` â resolvido (2026-08-07)

- ~~`sessionSecret = options.sessionSecret ?? options.token`, replicado em
  `app.ts:124`: quando nÃ£o hÃ¡ `sessionSecret` configurado, o HMAC de sessÃ£o
  do navegador usa o prÃ³prio token de autenticaÃ§Ã£o como chave~~ â agora
  `registerLocalSecurity` deriva a chave por padrÃ£o via
  `deriveSessionSecret` (HMAC-SHA256 do token com um rÃ³tulo de domÃ­nio
  fixo), mantendo a comparaÃ§Ã£o de token e a assinatura de cookie de sessÃ£o
  criptograficamente independentes mesmo partindo do mesmo segredo
  armazenado; `app.ts` nÃ£o replica mais o fallback, sÃ³ repassa
  `sessionSecret` quando explicitamente configurado. Teste de regressÃ£o em
  `local-security.test.ts` confirma que uma assinatura forjada com o token
  bruto como chave HMAC nÃ£o valida a sessÃ£o.
- ~~Os cÃ³digos de erro do `onRequest` hook (`BOOTSTRAP_NOT_ALLOWED`,
  `INVALID_BROWSER_BOOTSTRAP`, `ORIGIN_NOT_ALLOWED`, `ORIGIN_REQUIRED`,
  `SESSION_EXPIRED`, `INVALID_LOCAL_TOKEN`) eram strings soltas fora do
  union `ApiErrorCode`~~ â agora fazem parte do union e as respostas sÃ£o
  montadas por um helper local (`sendApiError`) tipado contra
  `ApiErrorCode`, sem depender de lanÃ§ar `ApiError`/`registerApiErrorHandling`
  (este mÃ³dulo Ã© testado de forma isolada, sÃ³ com Fastify puro, antes do
  error handler global existir necessariamente).

#### B.4 `apps/api/src/http/api-error.ts`

`ApiErrorCode` Ã© um union manual com mais de 150 variantes â sem problema
funcional, mas frÃ¡gil de manter. Vale considerar particionar por domÃ­nio
(`GitApiErrorCode`, `RailsApiErrorCode`, ...) unidos via union.

#### B.5 `apps/api/src/store/project-store.ts` â resolvido (2026-08-07)

- ~~`findProject` reconstrÃ³i `listProjects()` inteiro (percorre todos os
  scans) sÃ³ para achar um projeto por id~~ / ~~`updateProject` percorre
  todos os `workspaceScans`/`projects` a cada chamada de
  `setFavorite`/`setLastAccessedAt`~~ â adicionado um Ã­ndice incremental
  `Map<projectId, Set<workspaceId>>` (`projectWorkspaces`), mantido em
  `saveWorkspaceScan`/`deleteWorkspaceScan` sem remover-e-readicionar
  associaÃ§Ãµes que persistem entre scans (preserva a ordem que
  `updateProject` usa para decidir qual ocorrÃªncia retornar quando um
  projeto aparece em mais de um workspace). `findProject`/`updateProject`
  agora sÃ³ tocam os scans que de fato contÃªm o projeto, em vez de
  `O(total de projetos em todos os workspaces)`. Testes cobrindo rescan
  que remove um projeto, `deleteWorkspaceScan`, e um projeto que some e
  reaparece entre scans.

#### B.6 `packages/core` â concorrÃªncia inconsistente entre repositÃ³rios

- `ProjectDisabledRepository`/`ProjectRecentRepository` usam cache em
  memÃ³ria + `mutationQueue` para serializar escritas.
- ~~`WorkspaceRepository` (`workspace-repository.ts:139-266`) **nÃ£o tem**
  esse mecanismo~~ â **resolvido (2026-08-07)**: `create`/`setRecursiveScan`/
  `remove` agora passam pelo mesmo `mutationQueue`/`enqueue<T>` usado em
  `ProjectDisabledRepository`/`EnvironmentProfileRepository`, serializando o
  ler-modificar-escrever. Teste de regressÃ£o em
  `workspace-repository.test.ts` dispara 8 `create()` concorrentes na mesma
  instÃ¢ncia e confirma que nenhum Ã© perdido (falhava com `ENOENT` no
  `rename()` antes da correÃ§Ã£o, por duas escritas colidirem no mesmo
  arquivo temporÃ¡rio).
- `state-file-recovery.ts:17-33` usa `existsSync`/`copyFileSync` sÃ­ncronos
  num codebase inteiramente assÃ­ncrono â bloqueia o event loop no caso raro
  de arquivo corrompido.
- DuplicaÃ§Ã£o conceitual: `ProjectRecentRepository` e o `ProjectStore` em
  memÃ³ria guardam `lastAccessedAt` cada um a seu modo â duas fontes da mesma
  informaÃ§Ã£o, risco de dessincronia.

#### B.7 `packages/process-manager`

- ~~`process-store.ts:62-66,137-141` lanÃ§a exceÃ§Ã£o em arquivo de estado
  corrompido~~ â **resolvido (2026-08-07)**: `readStoredProcess` e
  `listStoredProcessEntries` agora tratam JSON corrompido/formato
  inesperado como o mesmo caso de "arquivo ausente" (retornam `null`/pulam
  a entrada) em vez de lanÃ§ar, e movem o arquivo para uma cÃ³pia
  `.unreadable-<timestamp>.bak` antes â mesmo padrÃ£o de
  `quarantineUnreadableStateFile` de `packages/core`, replicado localmente
  em `state-file-recovery.ts` porque `process-manager` nÃ£o depende de
  `core`.
- ~~`process-exit-tracking.ts:59-81`: mapas `observedExits`/`exitWaiters` sÃ³
  sÃ£o limpos quando `recordChildExit` completa com sucesso â se o evento
  `exit`/`error` nunca disparar, a entrada fica presa indefinidamente sem
  TTL de expurgo defensivo~~ â **resolvido (2026-08-07)**: `createExitTracker`
  agora aceita um relÃ³gio injetÃ¡vel (`now`, padrÃ£o `Date.now`) e roda um
  expurgo defensivo (`STALE_ENTRY_TTL_MS` = 10 minutos, bem acima de
  qualquer timeout real de start/stop) a cada novo `observeChild` â
  entradas mais velhas que o TTL sÃ£o removidas de ambos os mapas. Teste de
  regressÃ£o simula um processo cujo `exit`/`error` nunca dispara e confirma
  que a entrada trava atÃ© o TTL (sem o expurgo) e Ã© liberada depois dele.
- `port-utils.ts:92-106`: `findAvailablePort` varre portas sequencialmente
  (atÃ© 1000 portas no intervalo padrÃ£o) â poderia paralelizar em lotes.
- ~~`ManagedKind` (`process-store.ts:12`) nÃ£o inclui `'script'`, presente em
  `ManagedProcessKind` de `packages/contracts` â inconsistÃªncia de tipos
  entre contrato pÃºblico e cobertura real, vale documentar o
  motivo~~ â **resolvido (2026-08-07)**: intencional, nÃ£o Ã© lacuna â scripts
  tÃªm ciclo de vida e persistÃªncia prÃ³prios em
  `apps/api/src/services/script-execution/`, independentes do
  `ProcessStore`. Documentado com comentÃ¡rio no tipo `ManagedKind`.
  Aproveitado para tambÃ©m consolidar os trÃªs regex `.(server|test|worker|
  webpack)` duplicados entre `process-store.ts` e `log-retention.ts` (o
  "regex de `sweepStaleProcesses`" citado na nota de arquitetura sobre
  generalizar um novo `kind`) numa Ãºnica lista `MANAGED_KINDS`, para os
  dois nunca divergirem silenciosamente. Teste novo cobre
  `sweepStaleProcesses` para um processo `webpack` (sÃ³ `server` era
  exercitado antes).

#### B.8 `packages/project-discovery/src/discovery.ts`

- ~~DuplicaÃ§Ã£o significativa (~50 linhas) entre a varredura recursiva
  (`walkForProjects`) e a nÃ£o-recursiva dentro de `scanWorkspace` â mesmo
  filtro de diretÃ³rios ignorados, mesma detecÃ§Ã£o, mesmo padrÃ£o de
  warning~~ â **resolvido (2026-08-07)**: `scanWorkspace` agora sempre
  chama `walkForProjects`, com a varredura nÃ£o-recursiva montando um
  `WalkContext` com `maxDepth: 0`, sem os limites de projetos/tempo da
  varredura recursiva (`maxProjects`/`deadlineAt` como `Infinity`) e
  seguindo sÃ­mlinks de topo (`followSymlinks: true`), que era o
  comportamento implÃ­cito da versÃ£o nÃ£o-recursiva antiga. Um novo campo
  `reportDepthLimit` no contexto evita que subdiretÃ³rios nÃ£o explorados no
  nÃ­vel Ãºnico virem aviso `SCAN_DEPTH_LIMIT_REACHED` â isso sÃ³ Ã© reportado
  na varredura recursiva de verdade. Teste novo trava que a varredura
  nÃ£o-recursiva continua seguindo sÃ­mlinks de topo (comportamento que sÃ³
  existia implicitamente, sem cobertura, antes da unificaÃ§Ã£o).
- Ambas processam candidatos sequencialmente (`for...of` com `await`
  dentro), serializando I/O que poderia rodar com `Promise.all` limitado â
  nÃ£o mexido nesta entrega: a varredura recursiva depende da checagem
  incremental de `maxProjects`/timeout a cada candidato, entÃ£o paralelizar
  exigiria repensar esse controle de parada antecipada, nÃ£o Ã© uma
  mudanÃ§a pontual.

#### B.9 `apps/api/src/app-context.ts`

- ~~`AiAssistantService` tem 5 parÃ¢metros posicionais com `fetchImpl` no
  meio, obrigando `app-context.ts:130-136` a passar `undefined` explÃ­cito
  sÃ³ para preencher a posiÃ§Ã£o~~ â **resolvido (2026-08-07)**: o construtor
  agora recebe um Ãºnico `AiAssistantServiceOptions` nomeado
  (`projectFileService`/`gitService`/`fetchImpl`/`workspaceEditService`/
  `languageServerService`, todos opcionais); `app-context.ts` sÃ³ passa os
  campos que de fato substitui, sem `undefined` de preenchimento.
- `createAppContext()` Ã© uma raiz de composiÃ§Ã£o manual de ~25 serviÃ§os sem
  DI, com dependÃªncias de ordem implÃ­citas (nÃ£o documentadas) entre alguns
  deles.

#### B.10 `apps/web/src` â "enhancers" DOM fora da Ã¡rvore Vue

`main.ts:27-66` registra 17 mÃ³dulos "enhancer" que manipulam o DOM
diretamente via `MutationObserver`/`querySelectorAll` fora do Vue (mais de
60 arquivos entre `git-summary-history/*`, `git-summary-inline-diff-fix/*`,
`log-detail/*`, `log-visual/*`, `test-log-inspector/*`, etc.):

- MÃºltiplos `MutationObserver`s independentes observam
  `document.documentElement` com `subtree: true` simultaneamente â custoso e
  difÃ­cil de depurar; a ordem de registro em `main.ts` importa mas nÃ£o Ã©
  documentada/garantida.
- Cobertura de teste desigual: `git-summary-history-enhancer.ts` e
  `git-summary-inline-diff-fix.ts` (e submÃ³dulos) nÃ£o tÃªm nenhum teste
  correspondente, enquanto enhancers similares (`log-visual-enhancer`,
  `test-log-inspector`) tÃªm.
- SugestÃ£o de mÃ©dio/longo prazo: migrar progressivamente para
  componentes/composables Vue nativos, ou ao menos consolidar num Ãºnico
  `MutationObserver` compartilhado com pipeline de decoradores.

#### B.11 PadrÃ£o `RequestGeneration`/`RequestGate` aplicado de forma inconsistente â revisado (2026-08-07)

A lista original desta varredura estava desatualizada: `useProjectDatabaseOverview.ts`,
`useProjectDatabaseSnapshots.ts`, `useRailsMigrations.ts`, `useRailsModels.ts`,
`useScriptCatalog.ts`, `useProjectGitPanel.ts` e `useProjectTestProcess.ts` **jÃ¡**
guardam contra resposta fora de ordem (contador `generation` manual ou
`AbortController`); `useProjectScriptsPanel.ts` nÃ£o precisa de guarda prÃ³pria
porque delega inteiramente a `useScriptCatalog`/`useScriptExecution`, que jÃ¡
guardam. RevisÃ£o completa achou 3 gaps reais, todos corrigidos com o mesmo
idioma jÃ¡ usado no restante do arquivo (contador `generation` local, ou
`AbortController` quando o arquivo jÃ¡ usava esse padrÃ£o para outras
chamadas):

- `useProjectGitDiffPage.ts`: `loadOverview()` nÃ£o tinha guarda (ao contrÃ¡rio
  de `loadSnapshot()`, que jÃ¡ usa `AbortController`) â numa troca rÃ¡pida de
  projeto, o overview (branch exibida no cabeÃ§alho) podia ficar preso no
  projeto anterior.
- `useProjectGitHistoryPage.ts`: mesmo gap em `loadWorkspace()` (lista de
  branches do seletor), ao contrÃ¡rio de `loadHistory()`/`openCommit()`.
- `useRailsGenerator.ts`: sem guarda nenhuma â `reset()` (chamado pelo
  componente ao trocar de projeto) nÃ£o cancelava uma preparaÃ§Ã£o/confirmaÃ§Ã£o
  em andamento, entÃ£o a resposta atrasada reescrevia `pendingConfirmation`/
  `result` com dados do projeto errado, e `preparing`/`running` podiam ficar
  presos em `true` indefinidamente. Corrigido com um contador `generation`
  e `reset()` agora tambÃ©m limpa `preparing`/`running`.

Teste de regressÃ£o para cada um em `apps/web/test/` reproduz a falha antes
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

`ProjectEmbeddedEditor.vue` â resolvido (2026-08-09): o arquivo nÃ£o existe
mais, removido junto com a IDE embutida no PR #262 ("remove embedded
editor"). O maior candidato a decomposiÃ§Ã£o hoje Ã©
`EnvironmentProfilesPanel.vue`.

#### B.13 `apps/web/src/language-server/project-language-server-client.ts` â resolvido (2026-08-09)

~~Usa `as unknown as LspRange` em cÃ³digo de produÃ§Ã£o (linhas 429, 873, 1015,
1077, 1079, 1083) para converter ranges do Monaco para tipos LSP â diferente
do resto do frontend, onde esse tipo de asserÃ§Ã£o sÃ³ aparece em testes/mocks.
Como os dois tipos usam convenÃ§Ãµes de Ã­ndice diferentes (0-based vs
1-based), um cast direto esconde a ausÃªncia de conversÃ£o real. SugestÃ£o:
funÃ§Ã£o explÃ­cita `toLspRange`/`fromLspRange`.~~ â todo o diretÃ³rio
`apps/web/src/language-server/` foi removido junto com a IDE embutida no PR
#262 ("remove embedded editor"); o arquivo nÃ£o existe mais.

#### B.14 `packages/contracts` â resolvido (2026-08-07)

~~`ManagedProcess.exitCode?: number` nÃ£o distingue `null`, enquanto
`process-manager` circula `exitCode` como `number | null | undefined` em
vÃ¡rios pontos â vale alinhar o contrato pÃºblico ou documentar a normalizaÃ§Ã£o
feita na fronteira~~ â confirmado que nÃ£o Ã© uma inconsistÃªncia real: o
`null` (valor bruto de `child.exitCode` do Node quando o processo morre por
sinal) sÃ³ existe na parte interna e transitÃ³ria de `process-exit-tracking.ts`
(`ObservedExit`, `recordChildExit`). `terminalProcess`
(`process-store.ts`) Ã© a fronteira que normaliza â omite o campo
`exitCode` inteiramente quando Ã© `null`/`undefined`, em vez de propagar
`null` â e `isStoredProcess` jÃ¡ valida que um `StoredProcess` persistido
nunca tem `exitCode: null`. Documentado com comentÃ¡rios nos dois pontos.

#### B.15 ConfiguraÃ§Ã£o/build

`package.json` raiz declara `"@types/node": "^26.1.1"`, incompatÃ­vel com o
`engines.node` declarado (`^20.19.0 || >=22.12.0`) â conferir se Ã©
intencional ou atualizaÃ§Ã£o automÃ¡tica indevida.

#### B.16 Cobertura de testes â lacunas especÃ­ficas

- `packages/core/test/workspace-repository.test.ts` nÃ£o cobre concorrÃªncia
  de escrita (relacionado a B.6).
- MÃ³dulos "enhancer" `git-summary-history-enhancer.ts`,
  `git-summary-inline-diff-fix.ts` (e submÃ³dulos) sem teste direto (B.10).
- `packages/process-manager`: sem teste dedicado confirmado para
  `port-utils.ts` (`findAvailablePort`, `canListen`, `canConnect`,
  `listServerUrls`) nem `command-resolution.ts` â conferir se sÃ£o
  exercitados indiretamente ou ficam sem cobertura direta.

**Prioridades sugeridas (web):** 1) decompor componentes grandes (B.12);
avaliar migraÃ§Ã£o gradual dos "enhancers" DOM (B.10).
