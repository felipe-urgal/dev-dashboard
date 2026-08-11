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

## Decisão de escopo

### Entra na unificação (fase 1 — comandos de execução única)

**Testes, migrations e build** (hoje em `script-execution/*`) são bons candidatos: já são
"rodar um comando conhecido e observar a saída até o exit code", o mesmo modelo do console Rails —
só que sem interação (sem stdin do usuário depois de iniciado). Unificar significa trocar o
transporte SSE por PTY+WebSocket, reaproveitando `node-pty`/`ProjectTerminalPanel.vue`, e não
precisa expor um shell livre: o catálogo de comandos continua fechado
(`script-execution/command-resolution.ts` decide o comando, o navegador nunca manda uma string
livre).

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

- **Contrato**: estender `ProjectTerminalKind` (`packages/contracts/src/terminal.ts`) com novos
  valores não-interativos, ex. `'test-run' | 'migration' | 'build'`, ou introduzir um tipo irmão
  (`ProjectExecutionKind`) se a semântica precisar divergir o suficiente (sessão que fecha sozinha
  ao terminar, sem opção de reabrir por reconexão) — decidir durante a implementação, mantendo
  `shell`/`rails-console` intocados.
- **API**: reaproveitar `project-terminal-service.ts` como base, mas cada execução de
  teste/migration/build passa a nascer já com o comando fixo resolvido por
  `script-execution/command-resolution.ts` (nunca uma string vinda do navegador) e sem aceitar
  input do usuário depois de iniciada — diferente de `shell`/`rails-console`, que são interativos.
  Capturar exit code via `pty.onExit` (`node-pty` já expõe isso) para preservar o status
  estruturado que o SSE dava hoje.
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

1. **Prova de conceito com testes** (menor risco, já tem painel dedicado):
   - estender `ProjectTerminalKind`/contrato para um kind não-interativo de teste;
   - adaptar `project-terminal-service.ts` (ou criar serviço irmão) para spawnar o comando de teste
     já resolvido por `script-execution/command-resolution.ts` via PTY, capturando exit code;
   - nova rota (ou extensão da rota de terminal) para o kind de teste;
   - `ProjectTestsPanel.vue` migra de SSE para o transporte WS/PTY, reaproveitando (ou extraindo)
     a lógica de `ProjectTerminalPanel.vue`;
   - validar que `log-experience.ts` classifica corretamente a saída (ANSI strip);
   - manter o caminho SSE antigo funcionando até a migração ser validada em uso real, remover só
     depois.
2. **Migration**: repetir o padrão do item 1 para o fluxo de migrations Rails
   (`useRailsMigrations.ts` e rota correspondente).
3. **Build**: repetir o padrão para dependências/build (`useProjectDatabaseOverview.ts`/scripts de
   build — mapear o fluxo exato antes de iniciar, pode já estar coberto por
   `script-execution/*` genérico).
4. **Consolidação**: se os três fluxos acima confirmarem o padrão, avaliar remover o transporte SSE
   de `script-execution/*` por completo (rota `events-route.ts`) e deixar um único transporte
   (PTY/WS) para qualquer comando de execução única.
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
