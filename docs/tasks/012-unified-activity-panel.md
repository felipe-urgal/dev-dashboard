# Task 012 — Painel de atividade unificado

## Status

Concluída. Parte 1 (contratos + serviço agregador + rota
`GET /api/activities`) mergeada no PR #23. Parte 2 (view Vue `/activity`,
cliente, navegação, helpers testáveis) entregue nesta branch.

## Objetivo

Expor uma visão global, somente leitura, das atividades reconhecidas pelo
dashboard, agregando referências aos estados já pertencentes a execuções do
catálogo, testes e servidores sem copiar logs, comandos, PIDs ou caminhos
para um novo armazenamento.

## Escopo entregue (parte 1)

- Contrato `Activity` em `packages/contracts/src/activity.ts`: união
  discriminada e fechada por `origin` (`script` | `test` | `server`), com
  `id` opaco (`<origin>:<sourceId>`), `projectId`, `workspaceId` opcional,
  `label`, `status` normalizado (`running` | `succeeded` | `failed` |
  `cancelled` | `unknown`), `startedAt`, `finishedAt?` e `reference` tipada
  por origem.
- Serviço agregador `ActivityService`
  (`apps/api/src/services/activity-service.ts`) que consulta apenas
  serviços já autorizados (`ProjectStore`, `ProcessManager.listProcesses`,
  `ScriptExecutionService.history`) e descarta atividades cujo projeto não
  pertence mais aos workspaces cadastrados.
- Rota `GET /api/activities` com schema explícito de request/response
  (`activityListResponseSchema` em `apps/api/src/http/response-schemas.ts`)
  e filtros fechados `workspaceId`, `projectId`, `origin`, `status`,
  `page`, `pageSize`.
- Ordenação determinística: `startedAt` desc com desempate estável por
  `id`; paginação com limite máximo de 100 itens por página e
  `totalPages` = `ceil(total / pageSize)`.
- Testes em `apps/api/test/activity-service.test.ts`: agregação
  cross-origin, filtros por workspace/origem/status, paginação,
  isolamento de projetos removidos e mapeamento de exit code para
  `succeeded`/`failed`.
- README atualizado com a nova rota.

## Escopo entregue (parte 2)

- Cliente `fetchActivities(query)` e helper `buildActivityQuery` em
  `apps/web/src/api.ts`, com `AbortSignal` opcional propagado do
  componente.
- View `apps/web/src/views/ActivityView.vue` com filtros por workspace,
  projeto, origem e status; paginação; estados de erro, carregando e
  vazio; aviso de que a retenção varia por origem; link de cada item
  para a sub-rota segura já existente do projeto.
- Registro da rota `/activity` em `apps/web/src/router/index.ts` e
  entrada na navegação lateral (`apps/web/src/App.vue`), substituindo o
  placeholder "Jobs e logs".
- Helpers puros em `apps/web/src/utils/activity-format.ts`
  (`statusLabel`, `statusToneClass`, `originLabel`,
  `activityDetailPath`, `formatInstant`) reutilizados pela view e
  cobertos por teste unitário.
- Descarte de respostas obsoletas via `RequestGeneration` já existente,
  combinado com `AbortController` para requisições ainda em voo ao
  trocar filtros ou desmontar a view.
- Testes em `apps/web/test/activity.test.ts`: query builder, todos os
  formatadores, mapeamento de rota por origem e um caso end-to-end de
  `fetchActivities` com `fetch` estubado (sem montar componente Vue).

## Fora do escopo

- Persistência ou retenção nova para testes e servidores.
- SSE global, WebSocket ou fila de eventos.
- Reexecução, cancelamento ou qualquer ação mutável pelo painel.
- Teste de componente montado com Vue Test Utils: reservado para a
  próxima task, dedicada a inaugurar `@vue/test-utils` + jsdom no
  monorepo sem inflar dependências junto com esta entrega.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

## Sequência posterior

Próxima entrega (task 013): inaugurar a camada de testes montados no
frontend (`@vue/test-utils` + jsdom) cobrindo os estados
vazio/carregando/erro/sucesso da `ActivityView` e dos painéis já
existentes; em seguida a página global de processos (task 014).
