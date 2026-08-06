# Task 119 — Executa caso/exemplo específico do RSpec (`arquivo:linha`)

## Contexto

Último item da lista original de "próximos passos" desta sessão: "Executar
caso ou `describe` de teste específico [...] — dividir em entregas
separadas antes de implementar, porque os runners e formatos de relatório
diferem." Confirmado com o usuário: começar por **RSpec**, por ser o
mecanismo mais simples entre os runners suportados — resolve `arquivo:linha`
sozinho, sem exigir parser de AST/outline no dashboard para descobrir nomes
de `describe`/`it` (diferente de `node --test`/Jest/Vitest, que usam padrão
de nome via `-t`/`--test-name-pattern`, sintaxe totalmente diferente e
candidata a uma entrega própria).

## Decisão de design

Reaproveitar a infraestrutura de "executar arquivo específico" já existente
(`POST /projects/:projectId/tests/:commandId/files/start`), em vez de criar
uma rota nova: o corpo ganha um campo opcional `line`, e quando presente
(só para runners com `supportsCaseTarget`, hoje só `rspec`) o comando é
composto como `${arquivo}:${linha}` no lugar de só `${arquivo}`.

Isso também significa que **nenhuma mudança de contrato foi necessária** em
`TestExecutionRecord`/histórico: `targetFile` já é derivado do último
argumento do processo (`deriveTarget()` em
`test-execution-history-service.ts`), que passa a ser literalmente
`"spec/models/user_spec.rb:42"` para uma execução de caso — o histórico e o
"repetir execução" já funcionam sem tocar nesse serviço.

## Mudanças

- `packages/contracts/src/test.ts`: `ProjectTestCommand.supportsCaseTarget`.
- `apps/api/src/services/test-detection/file-scan.ts`:
  `CASE_TARGET_RUNNERS` (hoje só `rspec`).
- `apps/api/src/services/test-detection-service.ts`: `getOverview` marca
  `supportsCaseTarget`; `resolveFileCommand` aceita `line?: number`,
  rejeita com `TEST_CASE_TARGET_UNSUPPORTED` se o runner não suportar,
  compõe `arquivo:linha` quando presente.
- `apps/api/src/services/test-detection/errors.ts`,
  `apps/api/src/http/api-error.ts`: novo código `TEST_CASE_TARGET_UNSUPPORTED`.
- `apps/api/src/routes/tests/{command-routes,helpers}.ts`: corpo de
  `POST .../files/start` aceita `line` opcional (schema `integer`,
  `minimum: 1`).
- `apps/api/src/http/response-schemas/tests.ts`: `supportsCaseTarget` na
  resposta do overview.
- `apps/web/src/api/tests.ts`: `startProjectTestFile` aceita `line?`.
- `apps/web/src/composables/{useProjectTestProcess,useProjectTestsPanel}.ts`:
  `targetLine` no alvo de execução; campo de linha (texto→número validado)
  no fluxo "arquivo específico", visível só quando o comando selecionado
  suporta caso específico.
- `apps/web/src/components/ProjectTestsGuidedPanel.{vue,template.html}`:
  campo "Linha do caso/exemplo (opcional)" no formulário guiado.

## Fora de escopo

- `node --test`/Jest/Vitest (registrado em `tasks/PENDENCIAS.md` como item
  próprio — mecanismo de nome, não linha, e decisão de UX pendente sobre
  como descobrir/digitar o padrão).
- Persistir relatórios de cobertura (registrado como item próprio — 100%
  funcionalidade nova, sem base hoje).
- Repetir uma execução de caso específico pelo botão "Repetir" mantém o
  campo de arquivo preenchido com `"arquivo:linha"` por inteiro (em vez de
  separar arquivo e linha de novo) — funciona (o comando final é idêntico),
  mas a UX de "repetir" não é tão limpa quanto a de "arquivo" comum. Não
  corrigido nesta entrega por ser um detalhe cosmético, não funcional.

## Arquivos

Ver "Mudanças" acima, mais testes novos em
`apps/api/test/test-detection-service.test.ts`,
`apps/api/test/test-file-routes.test.ts` (rota HTTP completa, incluindo
rejeição para runner sem suporte) e
`apps/web/test/project-tests-panel.test.ts` (campo de linha visível/oculto
conforme o runner, envio do valor).

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
(`npm run docs:api`) para refletir o novo campo `line` e o código de erro
novo.
