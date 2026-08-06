# Task 115 — Prettier e política de formatação automática

## Contexto

Item pendente em `tasks/PENDENCIAS.md`: "Avaliar Prettier e uma política de
formatação automática em entrega própria, evitando um diff massivo
misturado com mudanças funcionais." O código-fonte TS/Vue não tinha
formatador automático — só ESLint (task 104), sem regras de estilo.

## Decisões de configuração

Confirmadas com o usuário antes de rodar `--write` em todo o repositório,
porque a decisão muda a cara de todo diff futuro do projeto:

- **printWidth**: padrão do Prettier (80). O código já usava um estilo
  bem verboso (um argumento/import por linha mesmo quando caberia numa
  linha só); testado antes de aplicar — Prettier preserva a quebra de
  linha original em `CallExpression`/`ObjectExpression` quando já há uma
  quebra logo após o `(`/`{` no código-fonte, então a maior parte desse
  estilo verboso existente **não foi comprimida**. O que mudou de fato:
  imports multi-linha viraram uma linha (quando cabem em 80 colunas),
  aspas, vírgulas finais e pequenos ajustes de espaçamento/indentação.
- **singleQuote**: `true`. Já era a convenção predominante (~205 arquivos
  em `apps/web`, ~164 em `apps/api`, ~38 em `packages` usavam aspas simples
  nos imports; só uma minoria usava aspas duplas) — minimiza o diff nesse
  eixo.

## Mudanças

- `prettier` como devDependency (`^3.9.6`).
- `.prettierrc.json` (`singleQuote: true`) e `.prettierignore` (`dist`,
  `coverage`, `node_modules`, `.codegraph`, `apps/web/e2e/.runtime`,
  `docs/architecture/api-reference.md` — gerado por script, não deve ser
  reformatado manualmente — e `package-lock.json`).
- Scripts `format`/`format:check` em `package.json`, mesmo escopo de globs
  do `lint` (`apps/**/*.{ts,vue}`, `packages/**/*.ts`, `scripts/**/*.mjs`,
  `eslint.config.js`).
- `npm run format` aplicado a todo o escopo (616 arquivos).
- CI (`.github/workflows/ci.yml`): novo step "Format check" (`npm run
  format:check`) logo após "Lint".
- README: nova tabela em "Scripts principais" com todos os comandos `npm
  run` voltados a uso direto (pedido à parte na mesma entrega).

## Achado à parte: 9 warnings de `prefer-const` não foram "corrigidos"

Rodar `npm run lint` revelou 9 warnings de `prefer-const` pré-existentes
(não relacionados à formatação). Investigados um a um antes de mexer:
todos seguem o mesmo padrão — uma variável `let x: T | undefined;`
declarada sem valor inicial, capturada por uma closure de cleanup
(`context.after`, ou a função `close` de uma rota SSE) registrada **antes**
da única atribuição de `x` mais adiante na mesma função. Trocar para
`const` moveria a declaração para o ponto da atribuição, criando uma
janela de TDZ (temporal dead zone): se a closure de cleanup for chamada
antes desse ponto — o que acontece de verdade nesses casos (ex. o serviço
de execução chama `close` de dentro do próprio `subscribe`, antes do
`heartbeat` ser criado) — o acesso a `x` lançaria `ReferenceError` em vez
de simplesmente ver `undefined`. Resolvido com
`// eslint-disable-next-line prefer-const` + comentário explicando o
motivo, nos 4 arquivos afetados (`apps/api/src/routes/scripts.ts`,
`apps/api/src/routes/tests/events-route.ts`,
`packages/process-manager/test/log-retention.test.ts`,
`packages/process-manager/test/process-manager.test.ts`). `npm run lint`
agora está limpo (0 erros, 0 warnings).

## Arquivos

- `.prettierrc.json`, `.prettierignore` (novos)
- `package.json` (scripts `format`/`format:check`, devDependency)
- `.github/workflows/ci.yml`
- `README.md`
- 616 arquivos em `apps/`, `packages/`, `scripts/`, `eslint.config.js`
  (formatação, sem mudança funcional)
- 4 arquivos com `eslint-disable-next-line prefer-const` explicado

## Verificação

```bash
npm run typecheck
npm run lint      # 0 erros, 0 warnings
npm run format:check
npm run build
npm test
```

Todos passando.
