# Task 234 — Unificar testes/migration/build no terminal PTY (desenho)

**Status:** planejamento. Nenhum código foi alterado nesta entrega — este documento é o desenho
técnico e o checklist de atividades acordado em conversa com o usuário, para orientar as próximas
sessões. Ver `tasks/NEXT.md` para o estado de prioridade atual.

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

### Fica como está (justificativa)

**Server, Sidekiq, Webpack (processos de fundo)** continuam no modelo de log em arquivo + polling.
Motivo: são daemons que existem independente de qualquer navegador conectado, precisam sobreviver a
reload/reconexão e suportar múltiplos observadores simultâneos lendo o mesmo processo. O modelo PTY
atual é 1 PTY por sessão de cliente — encaixar processos de fundo nesse modelo exigiria um
mecanismo novo de fan-out (múltiplo socket lendo o mesmo PTY, ring buffer para quem entra depois)
que hoje não existe e que o log em arquivo já resolve de graça. Também amplia a superfície de risco
sem necessidade: um PTY aceita stdin — não faz sentido permitir injeção de entrada arbitrária num
servidor rodando só para ver o log.

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
- **API — sessão destacável (o item novo, não é reaproveitamento direto):** o processo/PTY nasce
  atrelado ao projeto+execução, não ao socket. Precisa de: (a) um registro em memória (ou
  equivalente ao `record`/`observedExits` de `process-exit-tracking.ts`) que sobrevive à queda do
  WebSocket; (b) um ring buffer de saída por execução (teto de tamanho, mesmo espírito do limite de
  262144 bytes já aplicado a leitura de log) para reconexões tardias; (c) `connect` reanexa a uma
  execução em andamento existente em vez de sempre spawnar; (d) captura de exit code via
  `pty.onExit` mantida no registro após o processo terminar, para quem reconectar depois do fim
  ainda ver o resultado.
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

0. **Sessão destacável (pré-requisito, bloqueia os itens 1-3)**: implementar o registro em memória
   + ring buffer + reanexação descritos em "Desenho técnico" acima, validado com um teste
   isolado (spawn → desconecta o socket → processo continua → reconecta → recebe buffer + eventos
   novos → exit code preservado mesmo sem ninguém conectado no momento em que o processo termina).
   Sem isso pronto e testado, não iniciar os itens 1-3 — é o item que justifica (ou não) o resto do
   plano.
1. **Prova de conceito com testes** (menor risco, já tem painel dedicado):
   - estender o contrato com um `ProjectExecutionKind` de teste;
   - adaptar o serviço para spawnar o comando de teste já resolvido por
     `script-execution/command-resolution.ts` via PTY destacável, capturando exit code;
   - nova rota (ou extensão da rota de terminal) para o kind de teste;
   - `ProjectTestsPanel.vue` migra de SSE para o transporte WS/PTY, reaproveitando (ou extraindo)
     a lógica de `ProjectTerminalPanel.vue`;
   - validar que `log-experience.ts` classifica corretamente a saída (ANSI strip);
   - manter o caminho SSE antigo funcionando até a migração ser validada em uso real, remover só
     depois;
   - **checkpoint de decisão**: medir se o ganho percebido (fidelidade da saída) compensou o custo
     da sessão destacável; se não compensar, registrar aqui e não prosseguir para os itens 2-3.
2. **Migration** (só se o checkpoint do item 1 for favorável): repetir o padrão para o fluxo de
   migrations Rails (`useRailsMigrations.ts` e rota correspondente). Candidato mais fraco (ver
   tabela em "Decisão de escopo") — reavaliar antes de implementar, pode ficar no SSE atual.
3. **Build** (só se o checkpoint do item 1 for favorável): repetir o padrão para dependências/build
   (`useProjectDatabaseOverview.ts`/scripts de build — mapear o fluxo exato antes de iniciar, pode
   já estar coberto por `script-execution/*` genérico).
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
