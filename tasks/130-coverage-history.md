# Task 130 — Histórico de execuções de cobertura de projetos gerenciados

## Contexto

Item registrado em `tasks/PENDENCIAS.md` desde a task 128: tanto o leitor
Node/Istanbul (task 128) quanto o leitor SimpleCov/Rails (task 129) expõem
só o relatório mais recente — sem nenhum histórico entre execuções, ao
contrário do histórico de mutações Git (`GitMutationHistoryService`) e de
execuções de teste (`TestExecutionHistoryService`) que já existiam.

Confirmado com o usuário, em três decisões de escopo:

1. **Gatilho do snapshot**: a cada leitura do relatório — toda vez que
   `GET /projects/:projectId/coverage` encontra um relatório disponível, um
   snapshot é gravado no histórico se o `generatedAt` (mtime do arquivo)
   daquele relatório ainda não tiver sido registrado. Não é uma ação
   separada nem uma flag nova no comando de teste — é só "lembrar o que já
   foi lido em disco", consistente com o princípio "só lê o que o projeto
   já gera" das tasks 128/129.
2. **Retenção**: 50 snapshots por projeto, mesmo padrão default do
   `TestExecutionHistoryService`, configurável via
   `DEV_DASHBOARD_COVERAGE_HISTORY_LIMIT`.
3. **Granularidade**: só os totais agregados (`statements`/`branches`/
   `functions`/`lines`) por snapshot — não o detalhamento por arquivo, que
   deixaria cada entrada do tamanho do relatório inteiro.

## Decisão de design

`ProjectCoverageHistoryService` (novo) segue o mesmo padrão de persistência
do `TestExecutionHistoryService`: um arquivo JSON por projeto em
`~/.local/state/dev-dashboard/coverage-history/<projectId>.json`
(`DEV_DASHBOARD_STATE_DIR` respeitado), escrita atômica (arquivo temporário
+ `rename`), permissão `0600` no arquivo e `0700` no diretório, campo
`version` para compatibilidade futura, e id do projeto sanitizado no nome
do arquivo.

`record(projectId, summary)` é chamado pela própria rota
`GET /projects/:projectId/coverage` logo após `ProjectCoverageService.getSummary`
— sem endpoint/ação dedicada para "gravar manualmente". Deduplica por
`generatedAt`: se o snapshot mais recente já tem esse `generatedAt`, a
chamada é um no-op (evita crescer o histórico a cada poll da mesma tela sem
o projeto ter rodado testes de novo). Relatórios indisponíveis
(`available: false`) nunca são gravados.

`GET /projects/:projectId/coverage/history` (novo) devolve
`{ items: ProjectCoverageHistoryEntry[], total }`, mais recente primeiro —
sem paginação: o teto de 50 itens já limita o tamanho da resposta o
suficiente para não precisar dela.

## Mudanças

- `packages/contracts/src/coverage.ts`: `ProjectCoverageHistoryEntry`,
  `ProjectCoverageHistory`.
- `apps/api/src/services/project-coverage-history-service.ts` (novo):
  `ProjectCoverageHistoryService` — `record()`/`history()`, persistência em
  disco no mesmo padrão do `TestExecutionHistoryService`.
- `apps/api/src/routes/project-coverage.ts`: a rota `GET .../coverage`
  agora chama `projectCoverageHistoryService.record()` após ler o
  relatório; nova rota `GET .../coverage/history`.
- `apps/api/src/http/response-schemas/project-coverage.ts`,
  `apps/api/src/app-context.ts`, `apps/api/src/app.ts`: wiring padrão de
  serviço/schema/rota.
- `apps/web/src/api/project-coverage.ts`: `fetchProjectCoverageHistory`.
- `apps/web/src/components/ProjectCoveragePanel.vue`: carrega o histórico
  junto do relatório atual (mesmo `generation` de invalidação) e renderiza
  uma tabela "Histórico de execuções" (gerado em + os 4 percentuais) quando
  há snapshots — abaixo da tabela por arquivo já existente, escondida
  quando o histórico está vazio.

## Fora de escopo (decisão explícita)

- Ação/endpoint dedicado para gravar um snapshot manualmente — a gravação é
  sempre um efeito colateral da leitura via `GET .../coverage`.
- Endpoint/ação para limpar o histórico (ao contrário de
  `DELETE .../tests/history`) — não solicitado; o teto de 50 snapshots já
  evita crescimento sem controle.
- Detalhamento por arquivo em cada snapshot do histórico — só os totais
  agregados.
- Gráfico de tendência — a UI mostra uma tabela, não uma visualização.

## Arquivos

Ver "Mudanças" acima, mais testes novos em
`apps/api/test/project-coverage-history-service.test.ts` (grava/deduplica/
retenção/isolamento por projeto/persistência entre instâncias),
`apps/api/test/project-coverage-routes.test.ts` (gravação automática via
`GET .../coverage`, deduplicação de uma segunda leitura do mesmo relatório,
404 no histórico para projeto desconhecido) e
`apps/web/test/project-coverage-panel.test.ts` (tabela de histórico
renderizada quando há snapshots).

## Verificação

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run docs:api:check
npm test
```

Todos passando (595 testes na API, 372 no web);
`docs/architecture/api-reference.md` regenerado (`npm run docs:api`, 156
rotas — uma a mais que antes desta entrega).
