# Task 128 — Persiste (lê) relatórios de cobertura de projetos gerenciados (Node/Istanbul)

## Contexto

Item registrado em `tasks/PENDENCIAS.md`: cobertura de testes dos
*projetos gerenciados* (não deste codebase — isso já existe desde a task
122) era funcionalidade nova sem nenhuma base, com formatos completamente
diferentes por ecossistema (LCOV/JSON de Istanbul/c8/nyc no lado Node vs.
`.resultset.json`+HTML do SimpleCov no lado Rails), cada um exigindo
parser próprio.

Confirmado com o usuário, em três decisões de escopo:

1. **Ecossistema**: Node primeiro (Vitest/Jest/c8/nyc), formato Istanbul
   JSON — denominador comum entre os três, todos gravam
   `coverage/coverage-final.json` por padrão quando cobertura está
   habilitada, sem exigir configuração adicional. SimpleCov (Rails) fica
   registrado como item próprio em `tasks/PENDENCIAS.md`.
2. **Origem do dado**: a API só *lê* o arquivo que o projeto já gera
   sozinho (`coverage/coverage-final.json`, caminho fixo, sem entrada do
   navegador) — o dashboard não força flags de cobertura no comando de
   teste nem muda como os testes rodam.
3. **Persistência**: só o relatório mais recente, sem histórico entre
   execuções (ao contrário do histórico de mutações Git/execuções de
   teste, que já existem). "Persistir" aqui significa "expor o que já
   está persistido em disco pelo próprio projeto", não um armazenamento
   novo neste codebase.

## Decisão de design

`coverage/coverage-final.json` é o formato bruto do Istanbul — não vem com
totais prontos (diferente de `coverage-summary.json`, que só é gerado se o
reporter `json-summary` for configurado explicitamente, o que não é
garantido). Em vez de adicionar `istanbul-lib-coverage` como dependência
nova só para calcular os totais, `ProjectCoverageService` computa os
quatro percentuais (statements, branches, functions, lines) diretamente a
partir das contagens brutas do próprio arquivo:

- **statements**/**functions**: contagem de chaves em `s`/`f` (total) e
  quantas têm hit count > 0 (cobertas).
- **branches**: soma dos tamanhos dos arrays em `b` (cada entrada é um
  array de hit counts por caminho de branch) e quantos desses caminhos
  têm hit count > 0.
- **lines**: não vem pronto no formato bruto — deriva da linha inicial
  (`statementMap[id].start.line`) de cada statement, igual à técnica que
  o próprio `istanbul-lib-coverage` usa: uma linha conta como coberta se
  qualquer statement que começa nela tiver hit count > 0 (uma linha com
  múltiplos statements, ex. um ternário, usa o maior hit count entre
  eles).

Leitura é best-effort e nunca lança erro para o cliente: arquivo ausente,
maior que o limite (20 MB), JSON inválido ou com formato inesperado
resultam em `{ available: false }`, o mesmo estado usado quando o usuário
simplesmente não rodou os testes com cobertura ainda — não há distinção
entre "nunca rodou" e "relatório corrompido/grande demais" na resposta,
para não vazar detalhes internos do sistema de arquivos.

## Mudanças

- `packages/contracts/src/coverage.ts`: `ProjectCoverageSummary`,
  `ProjectCoverageTotals`, `ProjectCoverageFileSummary`,
  `ProjectCoverageMetric`.
- `apps/api/src/services/project-coverage-service.ts`: `ProjectCoverageService`
  — lê e resume `coverage/coverage-final.json` (limite de 20 MB, até 500
  arquivos na resposta, path traversal descartado via
  `path.relative`/`path.isAbsolute`).
- `apps/api/src/routes/project-coverage.ts`: `GET
  /projects/:projectId/coverage`.
- `apps/api/src/http/response-schemas/project-coverage.ts`,
  `apps/api/src/app-context.ts`, `apps/api/src/app.ts`: wiring padrão de
  rota/serviço/schema.
- `apps/web/src/api/project-coverage.ts`: `fetchProjectCoverage`.
- `apps/web/src/components/ProjectCoveragePanel.vue`: painel novo — chips
  de percentual total por métrica (cor por faixa: ≥80% verde, ≥50%
  amarelo, abaixo vermelho) e tabela por arquivo, com estado vazio
  explicando como gerar o relatório. Renderizado dentro da aba de testes
  (`ProjectTestsGuidedPanel.template.html`), abaixo do fluxo de execução
  guiada — painel independente, com seu próprio carregamento por
  `projectId` (mesmo padrão `generation` de invalidação ao trocar de
  projeto usado nos outros painéis).

## Fora de escopo (decisão explícita)

- SimpleCov/Rails (`coverage/.resultset.json`) — formato totalmente
  diferente, item próprio em `tasks/PENDENCIAS.md`.
- Histórico de cobertura entre execuções — só o relatório mais recente.
- `coverage-summary.json` pré-calculado — só o `coverage-final.json` bruto
  é lido; suportar o summary pré-calculado como atalho fica como
  possibilidade futura (mais simples de parsear, mas exigiria detectar
  qual dos dois formatos está presente).
- Forçar flags de cobertura no comando de teste do dashboard — a API só
  lê o que o projeto já gera; se o projeto não tiver cobertura habilitada
  na própria config, a resposta é `available: false`.

## Arquivos

Ver "Mudanças" acima, mais testes novos em
`apps/api/test/project-coverage-service.test.ts` (parsing, agregação,
tratamento de linha com múltiplos statements, entradas fora do projeto,
JSON corrompido), `apps/api/test/project-coverage-routes.test.ts` (rota
HTTP completa: 404, 401, `available:false`, resposta com relatório) e
`apps/web/test/project-coverage-panel.test.ts` (estado vazio, totais e
tabela, erro de rede, recarregamento ao trocar de projeto).

## Verificação

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run docs:api:check
npm test
```

Todos passando; `docs/architecture/api-reference.md` regenerado
(`npm run docs:api`, 155 rotas — uma a mais que antes desta entrega).
