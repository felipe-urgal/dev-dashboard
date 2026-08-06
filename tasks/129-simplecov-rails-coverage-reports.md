# Task 129 — Persiste (lê) relatórios de cobertura de projetos Rails (SimpleCov)

## Contexto

Continuação direta da task 128 (`tasks/128-managed-project-coverage-reports.md`), que
deliberadamente deixou SimpleCov/Rails de escopo — formato completamente diferente do
Istanbul, com item próprio registrado em `tasks/PENDENCIAS.md`.

Confirmado com o usuário, em duas decisões de escopo:

1. **Sim, implementar SimpleCov/Rails agora**, estendendo o mesmo endpoint e painel da
   task 128 (`GET /projects/:projectId/coverage`, `ProjectCoveragePanel.vue`) em vez de
   criar uma rota/painel paralelos.
2. **Diferença de formato entre Istanbul e SimpleCov**: SimpleCov não distingue
   *statements* de *lines* (só rastreia linha) nem mede cobertura de função por método.
   Decisão: `statements` reusa o mesmo objeto de métrica que `lines` (sem cálculo
   separado), e `functions` fica sempre `{ total: 0, covered: 0, pct: 100 }` — "não
   medido", não "sem cobertura".

## Decisão de design

`ProjectCoverageService.getSummary(projectPath, projectType)` agora recebe o `type` do
projeto (`ProjectType`, de `packages/contracts/src/project.ts`) e despacha para um dos
dois leitores privados: `getIstanbulSummary` (já existente, lê
`coverage/coverage-final.json`) para `'node'`/`'unknown'`, ou `getSimpleCovSummary`
(novo) para `'rails'`, que lê `coverage/.resultset.json` — o caminho padrão que a gem
`simplecov` grava sem exigir configuração adicional.

Formato do `.resultset.json`: chaveado no topo pelo nome da suíte de teste (ex.
`"RSpec"`), cada uma com uma chave `coverage` mapeando caminho absoluto de arquivo para
os dados de cobertura daquele arquivo. O valor por arquivo tem duas formas possíveis,
ambas suportadas:

- **Formato antigo**: array plano de hit counts por linha (índice = linha - 1;
  `null` marca linha não executável).
- **Formato novo** (SimpleCov ≥ 0.18): `{ lines: [...], branches: {...} }`, onde
  `branches` é um objeto aninhado condição → desfecho → hit count.

Quando mais de uma suíte cobre o mesmo arquivo (ex. `RSpec` e `Cucumber` no mesmo
projeto), os hit counts são unidos por arquivo: linhas pelo maior hit count por posição,
branches pelo maior hit count por combinação condição/desfecho — mesmo princípio que o
próprio SimpleCov usa para mesclar `.resultset.json` de execuções diferentes.

Reaproveita os mesmos `metric()`/`addMetric()`, limite de tamanho (20 MB) e de arquivos
retornados (500), e a mesma checagem de path traversal (`path.relative` +
`path.isAbsolute`) já usados no leitor Istanbul da task 128. Leitura é best-effort e
nunca lança erro para o cliente — arquivo ausente, JSON inválido ou maior que o limite
resultam em `{ available: false }`, igual ao Istanbul.

## Mudanças

- `apps/api/src/services/project-coverage-service.ts`: `getSummary` agora recebe
  `projectType?: ProjectType` (default `'node'`, mantendo compatibilidade com quem já
  chamava sem o segundo argumento) e despacha entre os dois formatos; novo leitor
  privado `getSimpleCovSummary` com normalização de array-plano vs. objeto
  `{lines, branches}`, merge entre suítes e as funções `summarizeSimpleCovLines`,
  `summarizeSimpleCovBranches`, `summarizeSimpleCovFile`, `mergeSimpleCovLineHits`,
  `mergeSimpleCovBranches`.
- `apps/api/src/routes/project-coverage.ts`: passa `project.type` para
  `getSummary`.
- `apps/web/src/components/ProjectCoveragePanel.vue`: nova prop opcional
  `projectType`; texto do estado vazio e do caminho do relatório mostrados na UI mudam
  conforme o tipo do projeto (`coverage/.resultset.json` + instrução do SimpleCov para
  Rails, `coverage/coverage-final.json` + instrução do Vitest/Jest/c8/nyc para Node).
- `apps/web/src/components/ProjectTestsGuidedPanel.template.html`: passa
  `:project-type="project.type"` para o painel.

## Fora de escopo (decisão explícita, herdada da task 128)

- Histórico de cobertura entre execuções — só o relatório mais recente.
- `coverage-summary.json` (Node) pré-calculado — só o `coverage-final.json` bruto.
- Distinção visual na UI entre "functions não medido" (Rails) e "functions com 0%"
  (Node/Istanbul sem funções cobertas) — ambos aparecem como o mesmo chip verde
  100%/0 de 0, decisão explícita do usuário de reusar a mesma métrica sem tratamento
  especial.

## Arquivos

Ver "Mudanças" acima, mais testes novos em
`apps/api/test/project-coverage-service.test.ts` (parsing do array plano e do formato
`{lines, branches}`, merge entre suítes, entradas fora do projeto/suítes malformadas,
`.resultset.json` ausente) e `apps/api/test/project-coverage-routes.test.ts` (rota HTTP
completa com um projeto `type: 'rails'`), `apps/web/test/project-coverage-panel.test.ts`
(texto do estado vazio para projeto rails).

## Verificação

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run docs:api:check
npm test
```

Todos passando (586 testes na API, 371 no web); `docs/architecture/api-reference.md`
não mudou (rota já documentada na task 128, sem alteração de contrato HTTP).
