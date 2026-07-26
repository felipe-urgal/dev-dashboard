# Task 012 — Painel de atividade unificado (parte 1: API)

## Status

Em andamento — parte 1 (contratos + API + testes) entregue nesta branch. A
página `/activity` no frontend e o teste de componente ficam para a parte 2.

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

## Fora do escopo desta parte

- Página `/activity` no Vue, teste de componente montado, cliente `api.ts`
  do frontend e navegação — parte 2.
- Persistência ou retenção nova para testes e servidores.
- SSE global, WebSocket ou fila de eventos.
- Reexecução, cancelamento ou qualquer ação mutável pelo painel.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

## Sequência posterior

Parte 2 (próxima branch): view Vue `/activity`, cliente no
`apps/web/src/api.ts`, entrada no `router`, teste de componente montado
para estados vazio/carregando/erro/sucesso, e atualização do
`docs/tasks/NEXT.md` apontando para a página global de processos (task
014) na sequência descrita no roadmap.
