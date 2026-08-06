# Task 127 — Executa caso/`describe` específico para runners Node (`-t`/`--test-name-pattern`)

## Contexto

Item registrado em `tasks/PENDENCIAS.md` desde a task 123 (RSpec
`arquivo:linha`): `node --test`/Jest/Vitest resolvem caso/`describe`
específico por **padrão de nome**, não por linha — mecanismo e sintaxe
totalmente diferentes do RSpec, com uma decisão de UX em aberto: o usuário
digita o padrão à mão, ou o dashboard tenta descobrir os nomes de
`describe`/`it` disponíveis primeiro?

Confirmado com o usuário: **usuário digita o padrão de nome**. Descobrir
nomes automaticamente exigiria um parser/outline por arquivo de teste (AST
ou regex) — escopo bem maior, sem base nenhuma no codebase hoje — e não foi
o que o usuário pediu.

## Decisão de design

Mesma decisão da task 123: reaproveitar a infraestrutura de "executar
arquivo específico" já existente (`POST
/projects/:projectId/tests/:commandId/files/start`) em vez de criar uma
rota nova. O corpo ganha um campo opcional `namePattern`, e quando presente
(só para runners com `supportsNamePatternTarget` — `vitest`, `jest`,
`node-test`) o comando recebe a flag de padrão de nome do runner **depois**
do arquivo:

- `vitest`/`jest`: `-t <padrão>`
- `node-test`: `--test-name-pattern <padrão>`

Diferente da task 123 (`line` é embutido no próprio argumento do arquivo,
`arquivo:linha`), aqui `namePattern` é um par de argumentos adicional
(`composeNamePatternArgs`), já que os runners Node não têm sintaxe
`arquivo:padrão`.

`line` e `namePattern` são mutuamente exclusivos na prática (conjuntos de
runners disjuntos — `CASE_TARGET_RUNNERS` só tem `rspec`,
`NAME_PATTERN_TARGET_RUNNERS` só tem `vitest`/`jest`/`node-test`), mas cada
um é validado de forma independente pelo serviço.

## Mudanças

- `packages/contracts/src/test.ts`: `ProjectTestCommand.supportsNamePatternTarget`.
- `apps/api/src/services/test-detection/file-scan.ts`:
  `NAME_PATTERN_TARGET_RUNNERS` (`vitest`/`jest`/`node-test`) e
  `composeNamePatternArgs`.
- `apps/api/src/services/test-detection/types.ts`: `DetectedTestCommand`
  omite `supportsNamePatternTarget` (computado em `getOverview`, igual aos
  outros dois campos `supports*`).
- `apps/api/src/services/test-detection-service.ts`: `getOverview` marca
  `supportsNamePatternTarget`; `resolveFileCommand` aceita `namePattern?:
  string`, rejeita com `TEST_NAME_PATTERN_UNSUPPORTED` se o runner não
  suportar, acrescenta a flag de padrão de nome quando presente.
- `apps/api/src/services/test-detection/errors.ts`,
  `apps/api/src/http/api-error.ts`: novo código
  `TEST_NAME_PATTERN_UNSUPPORTED`.
- `apps/api/src/routes/tests/{command-routes,helpers}.ts`: corpo de
  `POST .../files/start` aceita `namePattern` opcional (schema `string`,
  `minLength: 1, maxLength: 200`).
- `apps/api/src/http/response-schemas/tests.ts`: `supportsNamePatternTarget`
  na resposta do overview.
- `apps/web/src/api/tests.ts`: `startProjectTestFile` aceita `namePattern?`.
- `apps/web/src/composables/{useProjectTestProcess,useProjectTestsPanel}.ts`:
  `targetNamePattern` no alvo de execução; `selectedNamePattern`,
  `supportsNamePatternTarget` no fluxo "arquivo específico", visível só
  quando o comando selecionado suporta padrão de nome.
- `apps/web/src/components/ProjectTestsGuidedPanel.{vue,template.html}`:
  campo "Padrão de nome do caso/describe (opcional)" no formulário guiado.

## Bug encontrado e não corrigido nesta entrega

Ao escrever o teste de rota HTTP para esta funcionalidade, dois starts
reais e sequenciais do mesmo processo de teste (start → stop → start, na
mesma fixture) expuseram um bug pré-existente e não relacionado a esta
task no `packages/process-manager`: quando o processo spawnado morre muito
rápido sozinho (aqui, `npm run test` falhando de cara porque `vitest` não
está de fato instalado na fixture mínima do teste), `POST
.../tests/process/stop` retorna um erro genérico 500/`BAD_REQUEST` em vez
de tratar como já-parado, e o `POST .../files/start` seguinte pode ver
`PROCESS_ALREADY_RUNNING` mesmo com o processo anterior morto — indício de
corrida entre a saída real do processo e a leitura/escrita do registro de
status em `process-lifecycle.ts`. Contornado isolando o teste da task 127
em sua própria fixture/instância de app (sem encadear dois starts reais na
mesma fixture); registrado como item próprio em `tasks/PENDENCIAS.md` para
investigação futura — fora do escopo desta entrega.

## Fora de escopo

- Descobrir automaticamente nomes de `describe`/`it` disponíveis (decisão
  do usuário: descartado em favor de campo de texto livre).
- Persistir relatórios de cobertura (item próprio em `tasks/PENDENCIAS.md`).

## Arquivos

Ver "Mudanças" acima, mais testes novos em
`apps/api/test/test-detection-service.test.ts`,
`apps/api/test/test-file-routes.test.ts` (nova suíte HTTP isolada para
padrão de nome, incluindo rejeição para runner sem suporte) e
`apps/web/test/project-tests-panel.test.ts` (campo de padrão visível/oculto
conforme o runner, envio do valor). `apps/web/test/{log-export-panels,
project-tests-panel-redesign,project-tests-related,
project-tests-success-reset}.test.ts` atualizados só para incluir o novo
campo obrigatório `supportsNamePatternTarget` nas fixtures de
`ProjectTestOverview` — sem mudança de comportamento nesses arquivos.

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
(`npm run docs:api`) para refletir o novo campo `supportsNamePatternTarget`
e o `namePattern` do corpo de `files/start`.
