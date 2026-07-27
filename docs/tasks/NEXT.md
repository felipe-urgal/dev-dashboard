# Próxima atividade — 028: Histórico persistente de execuções de teste

## Contexto

A task 027 entregou execução de arquivo específico, reaproveitando o
`ProcessManager.startTest` existente (um único "slot" de teste por projeto,
sem histórico — cada nova execução substitui o estado da anterior). O
roadmap lista "histórico persistente e eventos para testes" como o próximo
passo desta frente, "antes de migrar para SSE". O catálogo de scripts já tem
esse padrão pronto desde as tasks 009-010
(`ScriptExecutionService`, persistência versionada e limitada, paginação por
IDs) — a ideia aqui é replicar a mesma abordagem para execuções de teste, não
inventar um modelo novo.

## Objetivo

Persistir um histórico limitado das execuções de teste (suíte inteira ou
arquivo específico) por projeto, sobrevivendo a reinícios da API, com
paginação e consulta pelo painel de testes — sem duplicar o modelo de
atividade unificado nem migrar para eventos em tempo real ainda.

## Plano detalhado

1. Estudar `ScriptExecutionService` (`apps/api/src/services/script-execution-service.ts`,
   tasks 007-010) como referência direta: formato de persistência, limite de
   histórico, reconciliação após reinício, paginação por IDs.
2. Decidir se o histórico de teste é um serviço próprio ou uma extensão do
   `ProcessManager` existente — hoje `ProcessManager` só rastreia o processo
   atual (`getTestProcess`/`startTest`), sem lista de execuções passadas;
   registrar isso é uma mudança de modelo, não só um campo novo.
3. Persistir metadados suficientes por execução: comando/arquivo alvo,
   início/fim, exit code, status — reaproveitando o mascaramento de log já
   existente para a leitura do conteúdo salvo.
4. Expor rota(s) de listagem paginada do histórico por projeto.
5. Adicionar ao painel de testes uma lista do histórico recente, distinta da
   execução atual já exibida.
6. Cobrir com testes de serviço (persistência, reconciliação após reinício,
   paginação) e de rota; ao menos um teste montado do painel.

## Fora do escopo

- Eventos SSE para execuções de teste (migração explicitamente posterior ao
  histórico persistente, por decisão do próprio roadmap).
- Relatório de cobertura.
- Sintaxe de caso/describe.
- Unificar este histórico com o painel de atividade global — mantém-se como
  consulta própria do painel de testes por enquanto, evitando duplicar fontes
  de verdade sem uma decisão explícita do modelo global (item separado no
  roadmap).

## Critérios de aceite

- o histórico de execuções de teste sobrevive a um reinício da API;
- é possível consultar execuções anteriores (suíte ou arquivo) paginadas por
  projeto, sem afetar a exibição da execução em andamento;
- `npm run typecheck`, `npm run build` e `npm test` passam com os novos
  testes de API e de componente.
