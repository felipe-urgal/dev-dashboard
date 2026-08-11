# Task 234 — Unificar testes/migration/build no terminal PTY

**Status:** em andamento. Itens concluídos: item 0 (sessão destacável), "Fica como está — push via
SSE" (logs de server/sidekiq/webpack) e item 1 (PoC de testes, escopo reduzido para suíte completa)
— entregues no PR #299; item 2 (Migration Rails, com remoção completa do fluxo antigo de
confirmação) e item 3 (Dependências/Build, mesma remoção completa) — entregues no PR #301. Item 4
(consolidação) ainda não implementado. Ver `tasks/NEXT.md` para o estado de prioridade atual.

## Origem

Durante uma sessão de brainstorm foi levantada a pergunta: já que a aba Terminal/Console
(`docs/guia/terminal.md`) roda um PTY de verdade via `node-pty` + WebSocket + xterm.js, faz sentido
usar essa mesma infraestrutura para tudo que hoje só *gera log* — testes, migration, build,
dependências — em vez de manter três arquiteturas de execução diferentes convivendo no
repositório? E o Assistente IA, que hoje é um chat estruturado contra um provider, poderia virar
um subprocesso de CLI rodando no mesmo modelo?

## Estado atual (levantado nesta sessão)

Hoje existem **três arquiteturas de execução/saída** distintas no monorepo web:

1. **Terminal/Console (`shell`/`rails-console`)** — `packages/contracts/src/terminal.ts`
   (`ProjectTerminalKind`), `apps/api/src/services/project-terminal-service.ts` (`node-pty`, um PTY
   por sessão, `MAX_TOTAL_SESSIONS`/`MAX_SESSIONS_PER_KEY`, token de confirmação de uso único de
   60s), `apps/api/src/routes/project-terminal.ts` (`GET status`, `POST confirmations`,
   `GET connect` via `@fastify/websocket`), `apps/web/src/components/ProjectTerminalPanel.vue`
   (`@xterm/xterm` + `@xterm/addon-fit`). Sessão efêmera: 1 PTY por cliente conectado, morre quando
   o socket cai — documentado em `docs/guia/terminal.md` e
   `docs/architecture/security.md#terminal-e-console-do-projeto`.
2. **Testes/scripts (`apps/api/src/services/script-execution/*`)** — processo filho comum (não
   PTY), progresso via SSE (`apps/api/src/routes/tests/events-route.ts`,
   `apps/api/src/routes/scripts.ts`), consumido por `ProjectTestsPanel.vue` /
   `ProjectScriptsPanel.vue`. Eventos estruturados (status, exit code) em vez de bytes crus.
3. **Processos gerenciados de fundo (`server`/`worker`/`webpack`, `packages/process-manager`)** —
   daemon de longa duração, log em arquivo (`resolveLogFile`, `<projectKey>.<kind>.log`),
   consumido via **polling HTTP** (`apps/web/src/composables/useProjectLogsPolling.ts`), não SSE
   nem WebSocket. Sobrevive a reconexão/reload; suporta múltiplos observadores simultâneos.

O Assistente IA (`apps/api/src/routes/ai-assistant.ts`, `ai-assistant-service.ts`) é ainda um quarto
modelo: chat estruturado (`POST` com `model` + `messages`, streaming de eventos JSON) contra um
provider (Ollama/OpenAI), sem relação com nenhuma das três execuções acima.

## Requisito descoberto: sobreviver a fechar a aba

Achado importante que muda o desenho (levantado em conversa, confirmado no código):
`apps/api/src/services/script-execution/lifecycle.ts` **não tem nenhum listener de
desconexão/`onClose`** matando o processo filho — hoje, fechar a aba de Testes/Scripts ou navegar
para outra tela **não mata** a execução em andamento; o usuário sai e volta depois para ver o
resultado. O mesmo vale para os processos de fundo (server/sidekiq/webpack), que são daemons
completamente desacoplados do navegador.

O Terminal/Console é o oposto **por escolha deliberada**: `docs/guia/terminal.md` documenta que
fechar a aba, recarregar ou clicar em "Encerrar sessão" mata o processo do shell, e que **não
existe** persistência de sessão entre reconexões (nada equivalente a `tmux`/`screen`). Isso faz
sentido para um shell interativo de acesso total — não faz sentido deixar um shell arbitrário
"esquecido" rodando em segundo plano indefinidamente.

**Consequência para a fase 1:** se a migração de testes/migration/build simplesmente reusar o
modelo de sessão do Terminal (PTY morre com o socket), isso **regride** uma capacidade que já
existe hoje. Para não regredir, o PTY de execução única precisa ser **desacoplado da conexão**:
o processo continua rodando no servidor mesmo sem cliente conectado, a saída fica bufferizada
(ring buffer em memória, com um teto de tamanho) e uma nova conexão reanexa nesse buffer em vez de
nascer um processo novo — o mesmo padrão de "sessão destacável" que hoje não existe em lugar
nenhum do dashboard web (o guia do Terminal documenta a ausência disso como limitação conhecida).
Isso é peça de arquitetura nova, não é só trocar SSE por WebSocket, e é o principal fator de custo
da unificação — o resto (contrato, rota, painel) é reaproveitamento direto do que já existe.

**Confirmação adicional (revisão do painel de Dependências/Build):** Testes, Scripts e Build já
passam por `script-execution/*`, que **já usa SSE** hoje (`apps/api/src/routes/scripts.ts`,
`apps/api/src/routes/tests/events-route.ts`) — não é polling, já é push, igual ao que acabamos de
implementar para server/sidekiq/webpack. Ou seja, o item caro (PTY) não resolve nenhuma lacuna de
"ficar ao vivo" nesses três — essa lacuna só existia em server/sidekiq/webpack e já foi fechada.
O único ganho restante de migrar testes/migration/build para PTY é fidelidade visual (cores/aparência
de terminal nativo), não funcionalidade — o que reforça tratar isso como aposta de baixa prioridade,
avaliada só depois que o usuário sentir falta desse acabamento visual no uso real.

## Decisão de escopo

### Critério para decidir, caso a caso

Dado o custo real (sessão destacável, não é reaproveitamento trivial), cada candidato deve ser
avaliado por este critério antes de virar atividade, em vez de assumir que "tudo vira terminal"
por padrão:

- **Vale a pena** quando o ganho (saída idêntica ao terminal real — cores, formatação,
  interatividade de exibição) supera o custo de construir/manter a sessão destacável, **e** a
  execução já é naturalmente "um comando fixo até o exit code" (sem stdin livre).
- **Não vale a pena** quando o modelo atual (SSE ou polling) já entrega o que o usuário precisa
  sem a complexidade nova — por exemplo, se o Diagnóstico (`log-experience.ts`) já cobre bem o
  caso e a saída bruta em PTY não agrega nada que o parser estruturado não tenha.
- Nesses casos, a resposta é **deixar como está**, documentado explicitamente aqui — não é
  obrigação migrar só porque a infraestrutura existe.

### Entra na unificação (fase 1 — comandos de execução única, candidatos)

**Testes, migrations e build** (hoje em `script-execution/*`) são os candidatos naturais: já são
"rodar um comando conhecido e observar a saída até o exit code", o mesmo modelo do console Rails —
só que sem interação (sem stdin do usuário depois de iniciado). Unificar significa trocar o
transporte SSE por PTY+WebSocket **com sessão destacável** (ver seção acima), reaproveitando
`node-pty`/`ProjectTerminalPanel.vue` como base, sem expor um shell livre: o catálogo de comandos
continua fechado (`script-execution/command-resolution.ts` decide o comando, o navegador nunca
manda uma string livre).

Antes de implementar cada um, aplicar o critério acima:

| Candidato | Ganho esperado (PTY) | Observação |
|---|---|---|
| Testes | saída com cores do runner, mais fiel ao terminal local | tem o Diagnóstico especializado (`log-experience.ts`) — validar que migrar não piora a classificação |
| Migration | saída simples, já é curta/pouco formatada hoje | ganho de cores é marginal; melhor candidato a "não vale a pena" se a sessão destacável não estiver pronta ainda |
| Build/dependências | pode ter saída longa e bem formatada (ex. webpack build único) | maior ganho percebido de fidelidade ao terminal |

A ordem de implementação (checklist abaixo) deliberadamente começa pelo caso com painel dedicado
(Testes) para validar a sessão destacável uma vez só; Migration e Build só avançam se esse PoC
confirmar que o custo compensa — se não compensar, ficam no SSE atual e isso deve ser registrado
aqui como decisão, não como pendência esquecida.

### Fica como está — mas o transporte troca de polling para push — **implementado**

**Status:** concluído nesta mesma entrega (PR #299). Server, Sidekiq e Webpack continuam no modelo
de log em arquivo — só o transporte mudou de polling para push (SSE), exatamente como desenhado
abaixo. Arquivos entregues: `apps/api/src/http/log-event-stream.ts` (novo, com
`apps/api/test/log-event-stream.test.ts` cobrindo snapshot inicial, reemissão só quando muda,
encerramento ao falhar/desconectar), rotas `GET .../process/logs/events` e
`GET .../rails/workers/:workerId/logs/events` (com testes de tradução de erro/404 em
`apps/api/test/server-process-log-events-route.test.ts` e
`apps/api/test/rails-worker-log-events-route.test.ts`), `followProjectProcessLogEvents`/
`followProjectRailsWorkerLogEvents` no frontend, e `useProjectLogsPolling.ts`/
`useProjectRailsWorker.ts` migrados para consumir o stream (a ação manual "Atualizar" continua
fazendo busca avulsa). Documentação atualizada: `docs/guia/logs.md`,
`docs/design/log-experience.md`, `docs/architecture/overview.md`,
`docs/architecture/api-reference.md` (via `npm run docs:api`). Gate completo verde: `typecheck`,
`lint`, `format:check`, `build`, `docs:api:check`, `test` (`apps/api` 704/704, `apps/web` 389/389).

Descrição original do desenho, mantida como referência:

**Server, Sidekiq, Webpack (processos de fundo)** continuam no modelo de **log em arquivo**, não
viram terminal/PTY. Motivo inalterado: são daemons que existem independente de qualquer navegador
conectado, precisam sobreviver a reload/reconexão e suportar múltiplos observadores simultâneos —
o modelo PTY atual é 1 PTY por sessão de cliente, e encaixar processos de fundo nele exigiria um
fan-out que hoje não existe, além de ampliar a superfície de risco à toa (PTY aceita stdin; não faz
sentido permitir injeção de entrada num servidor rodando só para ver o log).

O que muda: hoje o navegador **pergunta** por atualização (`useProjectLogsPolling.ts` faz
`setTimeout` + `fetchProjectProcessLog`; `useProjectRailsWorker.ts` nem re-consulta sozinho depois
de abrir "Ver logs" uma vez). Isso pode virar **push**: o servidor empurra a atualização assim que
o arquivo muda, em vez do navegador reconsultar em intervalo fixo — resolve o "fica piscando" sem
nenhuma peça de arquitetura nova (sem PTY, sem sessão destacável, sem expor caminho de arquivo pro
navegador). É literalmente o mesmo padrão SSE que Testes já usa hoje (`tests/events-route.ts`),
só aplicado a `readManagedLog`/`readWorkerLog` em vez de `script-execution/*`.

Desenho técnico (implementado como descrito):

- **Helper compartilhado novo**: `apps/api/src/http/log-event-stream.ts` — uma função
  `streamLogSnapshots(reply, initial, readNext)` que assume a resposta (`reply.hijack()`), escreve
  os headers de SSE (mesmo padrão de `tests/events-route.ts`: `text/event-stream`,
  `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`), manda o snapshot inicial, e
  então faz o **próprio servidor** chamar `readNext()` a cada 1s comparando `updatedAt`/`sizeBytes`
  com o último enviado — só emite frame novo quando o arquivo realmente mudou. Heartbeat a cada 15s
  igual ao padrão existente. `readNext` continua sendo a mesma leitura por arquivo de sempre
  (`processManager.readServerLog`/`railsRuntimeService.readWorkerLog`) — não muda como o log é lido,
  só quem decide quando reenviar.
- **Rotas novas** (mesmo formato de querystring/params das rotas de leitura existentes, sem
  `response` schema porque a resposta vira stream, igual `tests/events-route.ts`):
  - `GET /projects/:projectId/process/logs/events` em `server-process-routes.ts` (servidor);
  - `GET /projects/:projectId/rails/workers/:workerId/logs/events` em `worker-routes.ts`
    (sidekiq/webpack, mesmo `workerId` enum `'sidekiq'|'webpack'` que a rota de leitura já usa).
- **Frontend**: já existe o helper genérico `followEventStream` (`apps/web/src/api/core.ts`),
  usado hoje por `followTestExecutionEvents` (`apps/web/src/api/tests.ts:216-224`) — só adicionar
  `followProjectProcessLogEvents`/`followProjectRailsWorkerLogEvents` no mesmo estilo em
  `api/processes.ts`/`api/rails.ts`.
- **Composables**: `useProjectLogsPolling.ts` troca o `setTimeout`+`fetchProjectProcessLog` por uma
  assinatura de stream (fecha/reabre ao trocar de projeto, igual ao padrão `generation` já usado);
  `useProjectRailsWorker.ts` ganha atualização contínua enquanto `logsVisible` for `true` (hoje só
  busca uma vez ao abrir). A superfície pública dos dois composables (refs expostas) não muda — só
  a origem do dado internamente — então os componentes (`ProjectLogsPanel.vue` e o painel de
  sidekiq/webpack da captura de tela) não precisam mudar.
- **Documentação a atualizar junto** (regra do `CLAUDE.md`, mesma entrega): `docs/guia/logs.md`
  (se existir descrição do polling), `docs/design/log-experience.md` (nota de "Implementação"),
  `docs/architecture/overview.md`, e `npm run docs:api`/`docs:api:check` pelas duas rotas novas.
- **Testes**: cobertura em `apps/api/test/` para `streamLogSnapshots` (snapshot inicial, só reemite
  quando muda, heartbeat, encerra ao desconectar) e para as duas rotas; `apps/web/test/` para os
  composables migrados.

Esse item **não depende** do item 0 (sessão destacável) do restante do plano — é independente e bem
mais barato, pode ser feito primeiro.

### Fora de escopo agora — decisão de produto pendente

**Assistente IA como subprocesso de CLI** só faz sentido se a intenção for trocar a chamada de API
(chat estruturado contra Ollama/OpenAI) por `exec` de uma ferramenta de linha de comando real (nos
moldes do `dev-claude` do CLI bash). Isso é uma mudança de produto, não só de transporte — perde a
estrutura de mensagens/streaming JSON atual, muda o modelo de custo/autenticação, e depende de qual
CLI seria invocada. Precisa de uma decisão explícita do usuário antes de virar desenho técnico;
registrado aqui como pergunta em aberto, não como atividade.

## Desenho técnico (fase 1)

- **Contrato**: introduzir um tipo irmão a `ProjectTerminalKind`
  (`packages/contracts/src/terminal.ts`), ex. `ProjectExecutionKind = 'test-run' | 'migration' |
  'build'`, em vez de misturar com `shell`/`rails-console` — a semântica de ciclo de vida diverge
  o suficiente (destacável vs. morre com o socket) para não forçar os dois no mesmo union.
- **API — sessão destacável — implementada** em `DetachableExecutionService`
  (`apps/api/src/services/detachable-execution-service.ts`): o processo/PTY nasce atrelado a uma
  chave (`projectId:kind`), não a um socket — (a) registro em memória (`Map<chave, execução>`) que
  sobrevive à queda de qualquer conexão; (b) ring buffer de saída por execução (teto configurável,
  262144 bytes por padrão) para reconexões tardias; (c) `attach()` reanexa a uma execução em
  andamento (ou já terminada) em vez de sempre spawnar — `start()` só cria processo novo quando não
  há um rodando naquela chave; (d) exit code/sinal capturados via `pty.onExit` e mantidos no registro
  depois do processo terminar, disponíveis para quem reanexar depois do fim. Falta só conectar isso
  a uma rota HTTP/WebSocket real (itens 1-3 abaixo).
- **API — execução em si**: reaproveitar `project-terminal-service.ts` como referência de spawn via
  `node-pty`, mas cada execução de teste/migration/build nasce já com o comando fixo resolvido por
  `script-execution/command-resolution.ts` (nunca uma string vinda do navegador) e sem aceitar
  input do usuário depois de iniciada — diferente de `shell`/`rails-console`, que são interativos.
- **Web**: `ProjectTestsPanel.vue`/`ProjectScriptsPanel.vue` passam a consumir o mesmo
  transporte WS que `ProjectTerminalPanel.vue`, idealmente extraindo um composable compartilhado em
  vez de duplicar a lógica de conexão/reconexão.
- **Compatibilidade com o Diagnóstico** (`docs/design/log-experience.md`): o classificador
  (`utils/log-experience.ts`) hoje processa texto de log puro; saída de PTY inclui sequências ANSI
  de controle mesmo sem cores explícitas em alguns runners. Precisa validar que o texto é
  higienizado (strip ANSI) antes de chegar ao classificador, com teste de regressão cobrindo saída
  real de teste com cores.
- **Segurança**: o fluxo de confirmação (`docs/architecture/security.md#terminal-e-console-do-projeto`)
  precisa ser revisado para os novos kinds — mesmo não sendo interativos, ainda usam PTY; decidir
  se o token de confirmação de uso único faz sentido aqui ou se é dispensável por não haver stdin
  do usuário livre.

## Atividades

Ordem sugerida, cada bloco como PR próprio (não misturar com refatoração não relacionada, regra já
usada no roadmap da IA multi-provider):

0. **Sessão destacável (pré-requisito, bloqueia os itens 1-3) — implementado.** Entregue como
   `apps/api/src/services/detachable-execution-service.ts` (`DetachableExecutionService`):
   registro em memória por chave (`projectId:kind`), ring buffer de saída com teto configurável
   (padrão 262144 bytes, mesmo espírito do limite de leitura de log), `attach()`/`detach()` que
   nunca mata o processo — só `cancel()` explícito faz isso, com escalonamento TERM → 1s → KILL
   (mesmo padrão do `dev-stop` do CLI bash). `start()` rejeita uma segunda execução concorrente na
   mesma chave (`ALREADY_RUNNING`); `attach()` numa chave desconhecida lança `NOT_FOUND`. Ainda não
   está pendurado em nenhuma rota HTTP/WebSocket — é só a peça de infraestrutura, testada
   isoladamente. Testes em `apps/api/test/detachable-execution-service.test.ts` (10 casos) cobrem
   exatamente o cenário do checklist: spawn → desconecta → processo continua rodando → saída
   acumulada enquanto ninguém está conectado → reconecta → recebe o buffer completo + o que vier
   depois → exit code/sinal preservados mesmo para quem reanexa só depois do processo terminar.
   Gate completo verde (`typecheck`, `lint`, `format:check`, `build`, `docs:api:check` — sem rota
   nova, referência de API inalterada — e `test`: `apps/api` 714/714).
1. **Prova de conceito com testes — implementada, escopo reduzido para "suíte completa"
   apenas.** Decisão tomada em conversa: em vez de portar as três formas de disparo de teste
   (suíte/arquivo+caso+padrão/relacionados-à-branch — cada uma com resolução própria no backend e
   fortemente acopladas ao formato de `id`/`args` do `ManagedProcess`), o PoC cobre só a suíte
   completa. Arquivo específico, testes relacionados, histórico e o Diagnóstico especializado
   **saíram do ar temporariamente** — o código antigo (`ProjectTestsGuidedPanel.vue`,
   `useProjectTestsPanel.ts`, `useProjectTestProcess.ts`) continua no repositório como referência,
   só não é mais o componente renderizado pela aba Testes. Ver `docs/guia/testes.md` para o que
   está e o que não está disponível hoje.

   Entregue:
   - Backend: `ProjectTestPtyService` (`apps/api/src/services/project-test-pty-service.ts`)
     resolve o comando via `testDetectionService.resolveCommand` (não
     `script-execution/command-resolution.ts` como o desenho original assumia — Testes usa
     `processManager` kind `'test'` + `testDetectionService`, é `script-execution/*` que cobre
     Scripts/Build) e delega ao `DetachableExecutionService`. Rotas em
     `apps/api/src/routes/tests/pty-routes.ts`: `GET .../tests/pty/status`,
     `POST .../start`, `POST .../cancel`, `GET .../tests/pty/connect` (WebSocket, somente
     leitura — sem canal de `input`, catálogo fechado, sem token de confirmação porque não há
     stdin livre para proteger). 12 testes novos.
   - Frontend: `ProjectTestsPtyPanel.vue` (novo) substitui `ProjectTestsGuidedPanel.vue` como
     conteúdo de `ProjectTestsPanel.vue`; usa `@xterm/xterm` igual ao Terminal/Console. 3 testes
     novos, mais stubs de `getContext`/`matchMedia`/`ResizeObserver` em `test/setup.ts`
     (primeira vez que a suíte monta um componente que importa `@xterm/xterm`).
   - Os 20 testes antigos de `ProjectTestsGuidedPanel` (file/case/pattern/related/Diagnóstico)
     foram repontados para montar o componente diretamente em vez de via `ProjectTestsPanel`,
     preservando a cobertura do código de referência sem quebrar a suíte.
   - **checkpoint de decisão**: o ganho de fidelidade visual (cores/formatação nativas do
     terminal) é real e o custo de infraestrutura acabou sendo menor que o previsto, já que
     `DetachableExecutionService` (item 0) já resolvia a parte cara. O maior custo real foi outro:
     a complexidade do modelo de targeting existente, por isso o escopo foi reduzido em vez do
     item ser abandonado. Migration/Build (itens 2-3) devem reavaliar esse mesmo risco antes de
     começar — são mais simples que Testes (sem targeting múltiplo), então tendem a ser mais
     baratos, não mais caros.
2. **Migration — implementada, com remoção completa do fluxo antigo (decisão explícita do
   usuário: sem manter o código velho como referência, diferente do que foi feito com Testes).**
   Entregue:
   - Backend: `RailsMigrationPtyService` (`apps/api/src/services/rails-migration-pty-service.ts`)
     resolve o comando via `resolveRailsCommand` (`rails-inspection/command-resolution.ts`,
     mesmo helper do fluxo de inspeção) e monta os args por operação
     (`migrate`→`db:migrate`, `rollback`→`db:rollback STEP=1`, `seed`→`db:seed`,
     `prepare`→`db:prepare`), delegando ao `DetachableExecutionService` (mesma instância
     compartilhada com `ProjectTestPtyService`, chaves diferem pelo sufixo `:migration-pty` vs.
     `:test-pty`). Rotas em `apps/api/src/routes/rails/migration-pty-routes.ts`:
     `GET .../rails/migrations/pty/status`, `POST .../start` (body `{operation}`),
     `POST .../cancel`, `GET .../connect` (WebSocket, somente leitura, mesmo padrão de Testes:
     sem canal de `input`, catálogo fechado, sem token de confirmação porque não há stdin livre).
     O fluxo antigo (`RailsInspectionService.runMutation`/`prepareMutationConfirmation`, rotas
     `POST .../migrations/confirmations` e `POST .../migrations/mutations`, os tipos de contrato
     `RailsMigrationMutationConfirmation`/`RailsMigrationMutationResult`) foi **removido por
     completo**, não preservado como referência.
   - Frontend: `useRailsMigrations.ts` reescrito para usar o novo composable compartilhado
     `usePtyTerminalSocket.ts` (extraído nesta mesma entrega a partir da lógica que estava
     duplicada em `ProjectTestsPtyPanel.vue` — WebSocket + `@xterm/xterm`, protocolo de frames
     `ready`/`output`/`exit`/`error`). `ProjectDatabasePanel.vue`/`.template.html` passam a
     renderizar um terminal (`.database-mutation-terminal`) em vez do `ProjectLogExperience`
     antigo; o diálogo de confirmação do lado do cliente (`confirmDialog`) foi mantido como
     camada de segurança adicional, mesmo com o token de confirmação do backend removido.
   - **Correção de segurança encontrada e corrigida na mesma entrega**: a máscara de segredos
     (`maskSensitiveLogContent`, aplicada em toda leitura de log do dashboard) estava ausente na
     saída bruta do PTY — corrigida uma única vez em `DetachableExecutionService` (no handler
     `proc.onData`), o que cobre automaticamente Testes e Migration (e qualquer uso futuro do
     mesmo serviço).
   - Testes: `rails-migration-pty-service.test.ts` (7 casos novos), 8 testes obsoletos removidos
     de `rails-inspection-service.test.ts`, `rails-routes.test.ts` migrado para o fluxo PTY, teste
     de máscara de segredos adicionado em `detachable-execution-service.test.ts`,
     `project-database-panel.test.ts` atualizado para o novo fluxo (mock de `WebSocket`, mesmo
     padrão de `project-tests-pty-panel.test.ts`).
3. **Build/Dependências — implementado, com remoção completa do fluxo antigo (mesma decisão
   tomada para Migration).** Mapeamento prévio corrigiu uma suposição errada da task: o fluxo real
   não fica em `useProjectDatabaseOverview.ts` (isso é gestão de serviços de banco de dados, sem
   relação) — a UI dedicada é `ProjectDependenciesPanel.vue`, que já roteava suas ações
   (`bundler:*`, `package-manager:install`, `package-script:build`) para fora do catálogo genérico
   de Scripts via `project-script-visibility.ts`, mas reusava o mesmo `ScriptExecutionService`/SSE
   de Scripts por trás. Esse foi o **candidato de maior ganho líquido dos três**: saída
   potencialmente longa e colorida (build de assets), comando já fechado
   (`script-execution/command-resolution.ts`), sem stdin livre, e o custo caro
   (`DetachableExecutionService`) já pago por Testes/Migration.

   Entregue:
   - Backend: `ProjectDependenciesPtyService`
     (`apps/api/src/services/project-dependencies-pty-service.ts`) resolve a ação via
     `ScriptDetectionService.findAction` (mesmo catálogo fechado de Scripts) e o comando via
     `script-execution/command-resolution.ts::resolveCommand`, restringindo à mesma fronteira
     semântica de `projectScriptDestination` (bundler, package-manager, ou o script `build`).
     Rotas em `apps/api/src/routes/dependencies-pty-routes.ts`: `GET .../dependencies/pty/status`,
     `POST .../start` (body `{actionId}`), `POST .../cancel`, `GET .../connect` (WebSocket,
     somente leitura, sem token de confirmação — mesmo raciocínio de Testes/Migration).
   - Frontend: `useProjectDependenciesPty.ts` (novo composable) usa `usePtyTerminalSocket.ts`
     (terceiro consumidor do composable compartilhado). `ProjectDependenciesPanel.vue` passa a
     renderizar um terminal (`.dependencies-terminal`) em vez do `ProjectLogExperience` +
     histórico de execuções recentes antigo. O diálogo de confirmação do lado do cliente
     (`confirmDialog`) foi mantido para ações não somente-leitura, mesmo padrão de Migration.
   - **Escopo reduzido conscientemente, decisão do usuário**: o histórico de execuções recentes
     (últimas 5, com re-execução a partir do histórico) e o Diagnóstico especializado
     (`source="dependency"`) não têm equivalente no modelo PTY (que só guarda a execução
     corrente) — foram removidos, não preservados como referência, mesmo tratamento dado ao fluxo
     antigo de Migration.
   - Testes: `project-dependencies-pty-service.test.ts` (7 casos), `dependencies-pty-routes.test.ts`
     (6 casos, incluindo autenticação e ação fora do catálogo), `project-dependencies-panel.test.ts`
     atualizado para o novo fluxo (mock de `WebSocket`, mesmo padrão de
     `project-tests-pty-panel.test.ts`/`project-database-panel.test.ts`).
4. **Consolidação**: só se 1-3 migrarem de fato, avaliar remover o transporte SSE de
   `script-execution/*` por completo (rota `events-route.ts`) e deixar um único transporte
   (PTY/WS) para qualquer comando de execução única. Se algum candidato ficou no SSE por decisão
   (não por falta de tempo), o transporte antigo continua vivo para ele — não remover código ainda
   em uso.
5. **Documentação** (mesma entrega de cada PR acima, não depois — regra do `CLAUDE.md`):
   - `docs/guia/terminal.md` — documentar os novos kinds não-interativos e a diferença de
     comportamento frente a `shell`/`rails-console`;
   - `docs/architecture/security.md` — estender a seção do terminal para cobrir o novo modelo de
     ameaça (comando fixo, sem stdin livre, mas ainda PTY);
   - `docs/design/log-experience.md` — registrar que Testes passou a rodar sobre PTY e como isso
     afeta (ou não) a classificação de Diagnóstico;
   - `docs/architecture/overview.md` — atualizar o resumo de arquitetura do dashboard web;
   - `npm run docs:api` / `npm run docs:api:check` sempre que uma rota mudar.
6. **Testes automatizados**: cobertura em `apps/api/test/` para o novo serviço/rota (spawn,
   exit code, limites de sessão), `apps/web/test/` para o painel migrado, e um smoke E2E
   (`apps/web/e2e`) cobrindo o fluxo de rodar um teste ponta a ponta pela UI.

## Fora do checklist (decisões pendentes do usuário)

- Se/quando trocar o Assistente IA por subprocesso de CLI: qual ferramenta invocar, e se isso
  substitui ou convive com o chat estruturado atual contra Ollama/OpenAI.
- Se processos de fundo (server/sidekiq/webpack) devem eventualmente ganhar uma visão "terminal"
  somente leitura (attach sem stdin) além do polling atual — não é prioridade hoje, mas foi
  cogitado na conversa; precisa de desenho próprio de fan-out antes de virar atividade.
