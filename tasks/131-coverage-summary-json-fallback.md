# Task 131 — Atalho `coverage-summary.json` (Node) como fallback

## Contexto

Último item registrado em `tasks/PENDENCIAS.md` desde a task 128: além do
`coverage-final.json` bruto, o reporter `json-summary` do Istanbul gera um
segundo arquivo, `coverage/coverage-summary.json`, com os quatro totais já
pré-calculados por arquivo — mais simples de parsear (não exige derivar
`lines` a partir de `statementMap`), mas só existe se o projeto tiver
configurado esse reporter explicitamente (não é garantido, ao contrário do
`coverage-final.json`, gerado por padrão sempre que cobertura está
habilitada).

Confirmado com o usuário, em duas decisões de escopo:

1. **Prioridade quando os dois existem**: `coverage-final.json` sempre que
   existir e puder ser lido — `coverage-summary.json` só é tentado como
   fallback quando o primeiro está ausente (ou ilegível/corrompido/maior
   que o limite), mantendo o bruto como fonte principal por trazer mais
   detalhe.
2. **Tabela por arquivo**: continua aparecendo mesmo quando só o formato
   summary está disponível — `coverage-summary.json` já traz os quatro
   percentuais prontos por arquivo (chave = caminho absoluto), sem precisar
   recalcular nada.

## Decisão de design

`ProjectCoverageService.getIstanbulSummary` agora tenta
`getIstanbulFinalSummary` (lógica da task 128, inalterada) primeiro; se o
resultado for `available: false` por qualquer motivo (arquivo ausente,
JSON inválido, maior que 20 MB), cai para o novo
`getIstanbulSummaryFileSummary`, que lê `coverage/coverage-summary.json`.

O formato summary tem uma chave especial `total` (agregado do projeto
inteiro) e as demais chaves são caminhos absolutos de arquivo, cada uma com
`{statements, branches, functions, lines}` já no formato
`{total, covered, skipped, pct}`. O `pct` do próprio arquivo é ignorado —
os totais são recomputados via `metric()` (o mesmo helper usado no restante
do serviço) a partir de `total`/`covered`, para manter o mesmo
arredondamento em todos os três formatos suportados (Istanbul bruto,
SimpleCov, Istanbul summary). Entradas por arquivo fora do projeto ou sem
os quatro campos válidos são descartadas silenciosamente, mesmo padrão de
leitura best-effort das tasks anteriores.

## Mudanças

- `apps/api/src/services/project-coverage-service.ts`:
  `getIstanbulSummary` agora despacha entre `getIstanbulFinalSummary`
  (renomeado a partir do método original) e o novo
  `getIstanbulSummaryFileSummary`; helpers `toSummaryMetric`/
  `toSummaryTotals` para validar e recomputar os totais do formato
  summary.
- `apps/web/src/components/ProjectCoveragePanel.vue`: texto do estado
  vazio para projetos Node menciona que `coverage-summary.json` também é
  aceito quando `coverage-final.json` não está disponível.

## Fora de escopo (decisão explícita)

- Preferir `coverage-summary.json` quando os dois arquivos existem — o
  bruto sempre tem prioridade.
- Formato summary para SimpleCov/Rails — não existe equivalente na gem;
  fora do escopo desta task.

## Arquivos

Ver "Mudanças" acima, mais testes novos em
`apps/api/test/project-coverage-service.test.ts` (usado como atalho quando
final não existe, ignorado quando final existe, `available:false` sem
nenhum dos dois ou com summary malformado, entradas fora do projeto/
malformadas) e `apps/api/test/project-coverage-routes.test.ts` (rota HTTP
completa lendo só `coverage-summary.json`).

## Verificação

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run docs:api:check
npm test
```

Todos passando (601 testes na API, 372 no web); nenhuma rota nova, então
`docs/architecture/api-reference.md` não mudou (156 rotas, igual a antes
desta entrega).
