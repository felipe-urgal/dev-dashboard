# Task 014 — Página global de processos

## Status

Concluída.

## Objetivo

Consolidar em uma única página `/processes` os `ManagedProcess`
gerenciados pelo dashboard (servidores e testes), com filtros fechados
por workspace, projeto e tipo, e limpeza segura de estados obsoletos —
sem executar qualquer comando novo, sem sinalizar processos externos e
sem duplicar a fonte de verdade.

## Escopo entregue

- Rota `GET /api/processes` em `apps/api/src/routes/processes.ts`
  reutilizando o `ProcessManager.listProcesses` e o `ProjectStore` já
  autorizados. Filtra por `workspaceId`, `projectId` e `kind`
  (`server`|`test`), descarta processos cujo projeto não pertence mais
  a nenhum workspace cadastrado e ignora `kind` fora de
  `server`/`test`.
- Cliente `fetchManagedProcesses(query)` e `cleanupManagedProcesses()`
  em `apps/web/src/api.ts` com `AbortSignal` opcional.
- Helpers puros em `apps/web/src/utils/process-format.ts`:
  `kindLabel`, `processStatusLabel`, `processStatusToneClass`,
  `processDetailPath`, `formatDuration`.
- View `apps/web/src/views/ProcessesView.vue` com filtros
  workspace/projeto/tipo, estados vazio/carregando/erro/sucesso,
  contagem de duração em tempo real por relógio interno, botão
  "Limpar estados obsoletos" que confirma com o usuário antes de
  chamar `POST /api/processes/cleanup` já existente, e link de cada
  item para a sub-rota segura do projeto.
- Rota `/processes` registrada no router; item "Processos" na sidebar
  substitui o placeholder desabilitado.
- Estilo dedicado do botão de limpeza em `styles.css`.
- Testes:
  - `apps/api/test/processes-route.test.ts` cobre listagem completa,
    filtro por workspace, filtro por kind e exigência de autenticação
    (Fastify strippa `additionalProperties` extras silenciosamente,
    então esse caso não é testado).
  - `apps/web/test/processes-view.test.ts` monta a view e cobre os
    quatro estados vazio/carregando/erro/sucesso.
  - `apps/web/test/process-format.test.ts` cobre os cinco helpers
    puros.
- README atualizado com a nova rota.

## Fora do escopo

- Interromper processos externos ou expor caminhos arbitrários.
- Novo transporte SSE/WebSocket — atualização em tempo real fica
  restrita à duração do processo; a lista é recarregada por ação
  explícita do usuário (troca de filtro ou limpeza).
- Persistir histórico de processos (segue no Horizonte 2, junto com
  testes focados).

## Verificação

```
npm run typecheck
npm run build
npm test
```

`apps/api` cresce de 87 para 92 casos; `apps/web` de 16 para 23.

## Sequência posterior

Roadmap: seguir com Git em etapas (diff somente leitura) ou testes
focados, conforme priorização do Horizonte 2.
