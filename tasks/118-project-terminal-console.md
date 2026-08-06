# 118 — Abas Terminal e Console do projeto

## Status

Concluída.

## Contexto

Pedido do usuário: adicionar duas abas ao projeto — **Terminal** (shell interativo em qualquer
projeto) e **Console** (`rails console` em projetos Rails) — acessíveis diretamente pelo navegador.

Isso é uma exceção deliberada ao princípio de catálogo fechado de ações que rege o resto da API
(`docs/architecture/security.md`, "Catálogo fechado de ações"): um terminal de verdade é, por
definição, execução de shell arbitrária. A decisão de seguir com a shell completa (em vez de um
subconjunto restrito de comandos) foi confirmada explicitamente com o usuário antes da
implementação, dado o impacto no modelo de ameaça.

## Decisões

- **PTY real via [`node-pty`](https://github.com/microsoft/node-pty)** no backend, não pipes
  simples: comandos interativos (readline do IRB/Rails console, edição de linha do bash) dependem
  de um terminal de verdade para funcionar corretamente.
- **Sessão efêmera, sem persistência entre reconexões.** O processo do pseudoterminal vive e morre
  com o WebSocket. Nada equivalente a `tmux`/`screen` — mantém o escopo pequeno e evita o problema,
  bem maior, de sessões "esquecidas" rodando indefinidamente sem ninguém olhando.
- **Confirmação explícita de uso único por sessão**, no mesmo padrão já usado para o opt-in do
  Rails runtime do Language Server (token de 32 bytes, TTL de 1 minuto, vinculado a projeto+kind,
  consumido na primeira tentativa) — ver `ProjectTerminalService.prepareConfirmation`/`attach` em
  `apps/api/src/services/project-terminal-service.ts`. Isso mantém a autenticação de sessão (cookie
  local) e a "confirmação explícita" da ação como camadas distintas.
- **Protocolo simples em JSON sobre o WebSocket** (`{type:'input'|'resize', ...}` do cliente,
  `{type:'ready'|'output'|'exit'|'error', ...}` do servidor) em vez de reaproveitar o framing
  binário do gateway LSP — não há razão para otimizar por bytes aqui, e JSON mantém o código do
  serviço e do cliente simples de auditar.
- **Terminal shell usa `$SHELL` do processo da API** (fallback `/bin/bash`), não uma lista de
  shells oferecida ao usuário — mantém o catálogo de comandos permitidos fechado (não é o usuário
  escolhendo um executável arbitrário) e dá ao usuário o mesmo ambiente que ele já usa no terminal
  local (incluindo o próprio CLI Bash deste repositório, se carregado no `.bashrc`).
- **Console Rails prefere `bin/rails console`**, caindo para `bundle exec rails console` só quando
  o binstub não existe — nunca dispara `bundle install` nem qualquer resolução de dependências.
- **Limites de sessões simultâneas** (4 por projeto+kind, 16 por instância) e de tamanho de
  mensagem (65536 bytes) — mesma motivação dos limites já existentes no gateway LSP e no stream SSE
  do catálogo de scripts: conter o uso de recursos de uma aba esquecida aberta ou de um script mal
  comportado, sem exigir infraestrutura nova.
- **Frontend**: [xterm.js](https://xtermjs.org/) + `@xterm/addon-fit` (novo, `apps/web`). Um único
  componente `ProjectTerminalPanel.vue` parametrizado por `kind` serve as duas abas, evitando
  duplicar a lógica de conexão/protocolo entre Terminal e Console.

## O que foi implementado

- `packages/contracts/src/terminal.ts`: `ProjectTerminalKind`, `ProjectTerminalStatus`,
  `ProjectTerminalConfirmation`.
- `apps/api/src/services/project-terminal-service.ts`: `ProjectTerminalService` — status,
  confirmação, `attach()` (spawna o PTY, liga input/output/resize, aplica limites, encerra ao
  desconectar).
- `apps/api/src/routes/project-terminal.ts`: `GET /projects/:id/terminal/:kind` (status),
  `POST /projects/:id/terminal/:kind/confirmations`, `GET
  /projects/:id/terminal/:kind/connect` (WebSocket).
- `apps/api/src/app-context.ts` / `apps/api/src/app.ts`: injeção do novo serviço, encerramento das
  sessões ativas no `onClose` da API (mesmo padrão do serviço de Language Server).
- `apps/web/src/api/terminal.ts`, `apps/web/src/components/ProjectTerminalPanel.vue`: cliente HTTP
  + WebSocket, tela de aviso/confirmação antes de abrir a sessão, terminal via xterm.js com
  `ResizeObserver` para manter `cols`/`rows` sincronizados com o servidor.
- Rotas `project-terminal`/`project-console` em `apps/web/src/router/index.ts`; abas "Terminal"
  (sempre visível) e "Console" (só `project.type === 'rails'`) em
  `apps/web/src/views/ProjectDetailsView.vue`.
- Testes: `apps/api/test/project-terminal-service.test.ts` (protocolo completo, com PTY e
  WebSocket falsos) e `apps/api/test/project-terminal-routes.test.ts` (rotas HTTP: status,
  confirmação, validação de `kind`, projeto inexistente, autenticação).
- **Correção incidental em `apps/web/vite.config.ts`**: durante o teste manual desta entrega, a
  aba ficava presa em "Conectando…" indefinidamente ao rodar `npm run dev`. Causa: o proxy `/api`
  do Vite nunca tinha o flag `ws: true`, então o servidor de desenvolvimento nunca encaminhava o
  upgrade de WebSocket para a API — o handshake simplesmente não recebia resposta, sem erro
  visível. Isso já afetava silenciosamente o gateway de Language Server do Editor (mesma causa),
  só não tinha sido notado porque `npm run dev-web` (distribuição local, sem proxy separado) e o
  smoke E2E via Playwright (que builda e serve estático) não passam por esse caminho. Corrigido
  adicionando `ws: true` e um listener `proxyReqWs` (espelhando o `proxyReq` já existente, já que
  o `http-proxy` interno do Vite dispara um evento diferente para upgrades de WebSocket) para
  injetar o token local também nessas conexões. Validado manualmente com um cliente `ws` conectando
  por `ws://127.0.0.1:5173/api/...`, antes e depois da correção, tanto para `terminal/shell/connect`
  quanto para `language-server/ruby/connect`.
- Documentação: `docs/architecture/security.md` (nova seção "Terminal e console do projeto",
  respondendo item a item o checklist de "Requisitos antes de operações destrutivas" já existente
  para "terminal arbitrário"), `docs/architecture/overview.md`, `docs/guia/README.md` +
  `docs/guia/terminal.md` (novo), `docs/architecture/api-reference.md` (regenerado via `npm run
  docs:api`).

## Limitações conhecidas / fora de escopo

- Sem persistência de sessão entre reconexões — perder a conexão (recarregar a página, fechar a
  aba) mata o processo do shell. Se isso incomodar no uso real, uma entrega futura poderia estudar
  um modelo de sessão "desacoplável" (mais próximo de `tmux`), mas isso é bem mais complexo
  (multiplexação, buffer de scrollback persistido, limpeza de sessões órfãs) e não foi pedido.
- Sem log persistido/pesquisável do que foi digitado dentro da sessão — só os logs estruturados de
  conexão/desconexão da API. Registrado como possível melhoria futura em
  `docs/architecture/security.md`, não bloqueante.
- `node-pty` é um módulo nativo (compila via `node-gyp` na instalação). Funciona sem problema no
  ambiente de desenvolvimento/CI atual (Linux, Node 24, build tools disponíveis), mas é um ponto de
  atenção adicional para a matriz de suporte (`tasks/113-support-matrix.md`) ao considerar macOS ou
  Windows no futuro — cada plataforma precisa de um binário pré-compilado compatível.

## Verificação

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm test
npm run docs:api:check
```

Todos passando. Não foi feito smoke E2E dedicado (Playwright) para estas abas — a suíte de teste
de unidade/rota cobre o protocolo e a autenticação; testar a sessão de shell de ponta a ponta em
Playwright exigiria orquestrar um WebSocket real dentro do browser de teste, o que não foi
considerado necessário para esta entrega inicial.
