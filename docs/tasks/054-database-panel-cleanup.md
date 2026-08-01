# Task 054 — Limpeza do painel de banco e controle de serviço local

## Status

Implementação concluída. `typecheck`, `build` e `test` (API e web) aprovados.

## Objetivo

A aba **Banco de dados** tinha acumulado, ao longo das entregas 030–032,
seções que não são sobre banco de dados: **Rotas** (introspecção geral de
rotas Rails) e **Dependências** (diagnóstico do Bundler). O botão **Abrir
cliente** também ficou morto desde a entrega 003 — o handler do protocolo
`dev-dashboard://` nunca foi implementado (ver "Limitações conhecidas" de
`003-project-database.md`). Esta entrega remove o que não pertence à aba e
adiciona pausar/reiniciar o banco local, que faltava ao lado de iniciar.

## Resultado

### Interface

- abas **Rotas** e **Dependências** removidas do explorador de banco (o
  projeto Rails passa a ter só Visão geral, Ambientes, Snapshots, Migrations
  e Modelos); a visão geral não referencia mais rotas nem gems;
- botão **Abrir cliente** removido do detalhe do ambiente;
- ao lado de **Iniciar banco local** (ambiente indisponível), o ambiente
  acessível com serviço systemd reconhecido ganha **Pausar banco** e
  **Reiniciar banco**;
- quando dois ambientes detectados (ex.: `development` e `test` do mesmo
  `database.yml`) mapeiam para o mesmo serviço systemd local, o detalhe do
  ambiente selecionado avisa quais outros ambientes são afetados por
  pausar/reiniciar — o serviço é único por máquina, os ambientes lógicos não.

### API

- `DatabaseDetectionService.start` virou um caso do novo
  `runServiceAction(project, environmentId, 'start' | 'stop' | 'restart')`,
  reaproveitando a mesma seleção de unidade systemd e a mesma autorização via
  `pkexec --disable-internal-agent systemctl <ação> <unidade>`;
  `DatabaseStartError` virou `DatabaseServiceActionError` (carrega a ação além
  do motivo da falha);
- `POST /projects/:projectId/database/:environmentId/{start,stop,restart}`
  substituem a rota única `/start`, com o mesmo schema de erro adaptado por
  ação;
- campo `startAvailable` renomeado para `serviceAvailable` em
  `ProjectDatabaseEnvironment` — ele já significava "existe uma unidade
  systemd local reconhecida", não só "dá para iniciar";
- `ProjectDatabaseStartResult` virou `ProjectDatabaseServiceActionResult`
  (`{ environmentId, action, succeeded }`), usado pelas três rotas.

### Removido

- composables `useRailsRoutes.ts` e `useRailsBundler.ts` (só existiam para as
  abas removidas);
- `fetchProjectRailsRoutes` e `fetchProjectBundler` de `apps/web/src/api/rails.ts`.

As rotas de API `GET /projects/:projectId/rails/routes` e
`GET /projects/:projectId/bundler` **não foram removidas** — continuam
testadas e documentadas (`030-rails-migrations-routes.md`,
`032-bundler-diagnostics.md`) como capacidades da API; só deixaram de ter uma
tela que as chame. Reintroduzir uma interface para elas é uma decisão de
produto separada, fora do escopo desta limpeza.

## Arquivos principais

- `apps/web/src/components/ProjectDatabasePanel.vue`
- `apps/web/src/composables/useProjectDatabaseOverview.ts`
- `apps/web/src/api/rails.ts`
- `apps/web/src/database/*.css`
- `apps/api/src/services/database-detection-service.ts`
- `apps/api/src/routes/database.ts`
- `apps/api/src/http/response-schemas/rails.ts`
- `apps/api/src/http/api-error.ts`
- `packages/contracts/src/database.ts`

## Testes

- `apps/api/test/database-detection-service.test.ts` — pausa e reinicia o
  serviço systemd do banco local, além dos casos de início já existentes;
- `apps/web/test/project-database-panel.test.ts` — reescrito: abas de Rotas e
  Dependências removidas dos casos cobertos; casos novos para pausar/reiniciar
  um ambiente acessível, iniciar um ambiente indisponível e o aviso de
  serviço compartilhado entre dois ambientes;
- `apps/web/test/project-database-snapshots.test.ts` e
  `apps/web/test/database-layout-polish.test.ts` — ajustados para
  `serviceAvailable` e para a lista de abas atual.

## Limitações conhecidas

- o aviso de serviço compartilhado é heurístico: reconstrói o mapeamento
  driver → unidade systemd também no frontend (mesma tabela fechada do
  backend) só para decidir se dois ambientes colidem; não há uma fonte única
  compartilhada entre API e web para essa tabela;
- pausar/reiniciar seguem restritos a driver conhecido, host local
  (`localhost`/`127.0.0.1`/`::1`) e a mesma autorização polkit de
  `003-project-database.md` — nenhuma novidade de segurança nesta entrega.
