# Task 092 — Adaptador seguro para abrir destino no navegador local

## Status

Concluída.

## Contexto

Executada como frente paralela do inventário de `docs/PENDENCIAS.md`, seção
"Produto e fluxos operacionais": "Implementar um adaptador seguro para abrir
destinos no navegador local". Rodou em paralelo às tasks 091 (documentação da
API) e 093 (changelog), e à finalização da task 089 (projetos recentes) em
outro branch; nenhuma delas toca nos arquivos alterados aqui.

## Objetivo

Hoje, para abrir a URL de um servidor gerenciado no navegador, o usuário
precisa copiar o endereço manualmente ou usar o link `<a target="_blank">` já
existente no painel do servidor (que abre uma nova aba dentro do próprio
navegador atual). Esta task adiciona um segundo caminho: pedir para a API
abrir a URL no navegador **padrão do sistema operacional**, via processo
próprio, útil quando o dashboard roda embutido (ex. distribuição local
`dev-web`, ou um shell sem chrome completo de navegador).

## Decisão

Seguiu o mesmo padrão de segurança da task 064 (editor local):

- **Catálogo fechado de destino, não de URL.** O navegador só pode enviar
  `target: 'server'` — o único valor aceito pelo schema hoje. A API resolve a
  URL real a partir do processo gerenciado do próprio projeto
  (`ProcessManager.getServerProcess`), nunca de um campo livre do corpo da
  requisição. Generalizar para outros destinos (ex. um health check) significa
  adicionar um novo valor ao enum e um novo resolvedor de URL no lado da API,
  não abrir o corpo da requisição.
- **Só abre se o processo estiver de fato rodando.** Mesma restrição das
  leituras de log: a rota rejeita com `409 BROWSER_TARGET_NOT_RUNNING` se não
  houver processo do tipo `server` para o projeto, ou se o `status` não for
  `running`, ou se o processo não tiver `url` resolvida.
- **Catálogo fechado de comando por sistema operacional**, sempre via `spawn`
  com `shell: false` e argumentos explícitos — nunca a URL interpolada numa
  string de shell:
  - macOS: `open <url>`;
  - Linux: `xdg-open <url>`;
  - Windows: `cmd /c start "" <url>` — tratado como caso especial porque
    `start` é builtin do `cmd.exe`, não um executável no `PATH`; o caminho do
    `cmd.exe` vem de `ComSpec`, não de uma busca no `PATH` como os demais.
- **Falha limpa quando não há navegador disponível** (ex. ambiente headless
  ou container sem `xdg-open`): a detecção usa a mesma varredura do `PATH`
  usada pelo editor da task 064; sem executável resolvido, a API responde
  `409 BROWSER_NOT_AVAILABLE` sem tentar `spawn`. O botão na UI mostra a
  mensagem de erro existente do painel, sem travar a interface.
- **UI mínima**: um botão adicional em `ProjectServerPanel`, ao lado do link
  "Abrir localhost" já existente, visível apenas quando o processo do
  servidor está `running`. Usa o padrão de mensagem/erro/loading já
  estabelecido no restante do painel (`errorMessage`, `useAutoDismiss`).

## Escopo entregue

- `packages/contracts/src/browser.ts` — `ProjectBrowserTarget` (`'server'`) e
  `ProjectBrowserOpenResult`;
- `apps/api/src/services/project-browser-service.ts` — catálogo fechado de
  openers por `NodeJS.Platform`, resolução do executável via `PATH` (ou
  `ComSpec` no caso especial do Windows), `spawn` destacado sem shell;
- `apps/api/src/routes/project-browser.ts` — `POST
  /api/projects/:projectId/browser/open`, valida `projectId` e `target` por
  schema, resolve a URL a partir do `ProcessManager`, traduz erros do serviço
  para `ApiError`;
- novos códigos em `ApiErrorCode`: `BROWSER_TARGET_NOT_RUNNING`,
  `BROWSER_NOT_AVAILABLE`, `BROWSER_LAUNCH_FAILED`;
- `apps/api/src/app-context.ts` / `apps/api/src/app.ts` — registro do serviço
  e da rota, seguindo o mesmo padrão do editor;
- `apps/web/src/api/browser.ts` — `openProjectBrowserTarget`;
- `apps/web/src/components/ProjectServerPanel.vue` /
  `.template.html` — botão "Abrir no navegador do sistema", visível só com o
  servidor rodando, com estado de carregamento/mensagem/erro.

## Critérios de aceite

- o navegador envia somente `projectId` (na URL) e `target: 'server'` (no
  corpo) — nunca uma URL;
- `target` fora do catálogo é recusado pelo schema com `VALIDATION_ERROR`;
- projeto ausente retorna `PROJECT_NOT_FOUND`;
- processo do servidor ausente, parado ou sem `url` retorna
  `BROWSER_TARGET_NOT_RUNNING` sem tentar abrir nada;
- sistema operacional sem opener no catálogo, ou opener não encontrado no
  `PATH`/`ComSpec`, retorna `BROWSER_NOT_AVAILABLE` sem `spawn`;
- falha do processo do opener retorna `BROWSER_LAUNCH_FAILED` sem vazar a
  mensagem interna do erro;
- todo `spawn` usa `shell: false` e argumentos explícitos, sem interpolação
  de string;
- o botão só aparece com o servidor `running` e mostra estado de
  carregamento/erro sem travar o restante do painel.

## Testes automatizados

- `apps/api/test/project-browser-service.test.ts` — catálogo por plataforma
  (`darwin`/`linux`/`win32`), caso especial do `cmd.exe`, indisponibilidade
  sem comando resolvido, plataforma fora do catálogo, e tradução de falha de
  `spawn` sem vazar detalhes;
- `apps/api/test/project-browser-routes.test.ts` — abertura com processo
  rodando, recusa com processo parado/ausente, projeto ausente, `target` fora
  do catálogo, e indisponibilidade quando não há comando no sistema;
- `apps/web/test/project-detail-cards.test.ts` — botão visível e funcional
  com o servidor rodando (chama `openProjectBrowserTarget` com `projectId` e
  `'server'`, mostra a mensagem de sucesso), e ausente quando não há
  servidor em execução.
- `npm run typecheck`, `npm run build` e `npm test` na raiz, todos aprovados
  (API: 430 testes; web: 320 testes; demais pacotes sem regressão).

## QA manual

```bash
npm run dev
# painel do servidor de um projeto com capacidade "server":
# 1. iniciar o servidor;
# 2. clicar em "Abrir no navegador do sistema" — deve abrir uma aba no
#    navegador padrão do SO (não necessariamente o mesmo navegador da aba do
#    dashboard);
# 3. parar o servidor — o botão desaparece;
# 4. simular indisponibilidade (ex. remover xdg-open do PATH num container) —
#    o clique deve mostrar mensagem de erro sem travar o painel.
```

## Limitações

- catálogo de destino restrito a `'server'` — abrir outros destinos (ex. um
  endpoint de health check específico) exige estender o enum e o resolvedor
  de URL na API, não é suportado hoje;
- a disponibilidade do opener depende do `PATH` (ou `ComSpec` no Windows)
  herdado pelo processo da API — o mesmo tipo de limitação já documentado
  para o editor da task 064;
- sem suporte oficial testado em macOS/Windows reais neste ambiente — a
  cobertura automatizada valida a seleção de comando e argumentos por
  plataforma via injeção de dependências, não a execução real do `open`/
  `cmd.exe` fora do Linux;
- o botão novo convive com o link "Abrir localhost" já existente (abre nova
  aba no navegador atual) em vez de substituí-lo — os dois cobrem cenários
  diferentes e a escolha de qual usar fica com o usuário.

## Arquivos alterados

- `packages/contracts/src/browser.ts` (novo)
- `packages/contracts/src/index.ts`
- `apps/api/src/services/project-browser-service.ts` (novo)
- `apps/api/src/routes/project-browser.ts` (novo)
- `apps/api/src/http/api-error.ts`
- `apps/api/src/app-context.ts`
- `apps/api/src/app.ts`
- `apps/api/test/project-browser-service.test.ts` (novo)
- `apps/api/test/project-browser-routes.test.ts` (novo)
- `apps/web/src/api/browser.ts` (novo)
- `apps/web/src/api.ts`
- `apps/web/src/components/ProjectServerPanel.vue`
- `apps/web/src/components/ProjectServerPanel.template.html`
- `apps/web/test/project-detail-cards.test.ts`
- `docs/PENDENCIAS.md`
- `docs/tasks/PARALLEL-WORK.md`
- `docs/tasks/README.md`
- `docs/tasks/092-browser-adapter.md` (novo, este arquivo)
