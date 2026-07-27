# Task 028 — Histórico persistente de execuções de teste

## Status

Concluída.

## Objetivo

Persistir um histórico limitado das execuções de teste (suíte inteira ou
arquivo específico) por projeto, sobrevivendo a reinícios da API, com
paginação e consulta pelo painel de testes — sem duplicar o modelo de
atividade unificado nem migrar para eventos em tempo real ainda.

## Escopo entregue

- `TestExecutionRecord`/`TestExecutionHistory` (contrato compartilhado): um
  registro por execução (`commandId`, `targetFile` opcional, status,
  `startedAt`/`finishedAt`, `exitCode`) e a lista paginada.
- `TestExecutionHistoryService`
  (`apps/api/src/services/test-execution-history-service.ts`): um arquivo
  JSON por projeto (`<stateDir>/tests-history/<projectId>.json`, escrita
  atômica via arquivo temporário + rename, como o histórico de scripts),
  sem o motor de spawn/log das tasks 007-010 — reaproveita
  `ProcessManager.startTest`/`getTestProcess` já existentes.
- Como `ProcessManager` só guarda o snapshot da execução *atual* (sem lista
  própria de execuções passadas), a reconciliação acontece em dois pontos:
  logo antes de iniciar uma nova execução (para arquivar o snapshot final da
  execução anterior antes que `startTest` o sobrescreva) e ao consultar o
  histórico (para refletir o estado mais recente da execução em andamento).
  Se o processo gerenciado desaparecer sem reconciliação prévia (ex.: varredura
  de retenção), a entrada aberta é marcada `failed` de forma conservadora em
  vez de ficar presa em "em execução" para sempre.
- Rota `GET /projects/:projectId/tests/history` com paginação (`page`,
  `pageSize`).
- Painel de testes do detalhe do projeto ganhou uma seção "Histórico de
  execuções" com lista, paginação e atualização automática ao final de cada
  execução.
- Testes de serviço (registro, reconciliação para estado terminal e para
  processo ausente, persistência entre instâncias — simulando reinício,
  paginação, limite de histórico, arquivo corrompido) e de rota (histórico
  populado a partir de uma execução real de arquivo); testes montados do
  painel para a lista e a paginação.

## Decisões e limitações

Eventos em tempo real (SSE) para execuções de teste continuam fora do
escopo — a task 028 é o passo explicitamente anterior no roadmap. O
histórico não é atualizado por push; depende de alguém consultar a rota
(o painel já faz isso ao carregar e ao final de cada execução), o que é
suficiente para o critério de "sobreviver a um reinício", mas não é
observação em tempo real de uma execução em andamento em outra aba.

Este histórico permanece uma consulta própria do painel de testes, sem
unificação com o painel de atividade global — decisão consistente com as
tasks de Git (016/025/026), que também mantiveram suas mutações fora desse
modelo até uma decisão explícita de arquitetura.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

## Fora do escopo

- Eventos SSE para execuções de teste.
- Relatório de cobertura.
- Sintaxe de caso/describe.
- Unificação com o painel de atividade global.
