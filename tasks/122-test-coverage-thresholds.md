# Task 122 — Mede cobertura e define metas por camada

## Contexto

Item pendente em `tasks/PENDENCIAS.md`: "Medir cobertura e definir metas
por camada." Não havia medição de cobertura em nenhum workspace.

## Decisão

Confirmada com o usuário: política de **ratchet** — medir a cobertura real
de hoje em cada workspace e usar esse número como piso mínimo no CI, em vez
de um alvo arbitrário (ex. "80% em tudo") desconectado de onde o projeto
está. O piso só sobe (quando a cobertura melhora, considerar subir o
threshold na mesma entrega); descer é aceitável só quando deliberado e
justificado (ex. remoção de código morto), nunca silencioso.

## Medição e pisos definidos

Restrita a `src/**/*` de cada workspace (exclui `test/`, e para `apps/api`
exclui explicitamente o `dist/` dos packages importados, que já tem
cobertura própria medida no workspace de origem — sem essa restrição a
medição de `apps/api` ficava poluída por arquivos de outros workspaces).

| Workspace | Linhas | Branches | Funções |
|---|---:|---:|---:|
| `apps/api` | 91% | 76% | 89% |
| `packages/core` | 93% | 82% | 93% |
| `packages/process-manager` | 91% | 81% | 89% |
| `packages/project-discovery` | 94% | 76% | 100% |
| `apps/web` (statements/branches/functions/lines) | 60% / 52% / 67% / 62% | | |

Ferramenta: `--experimental-test-coverage` nativo do Node (`--test-coverage-lines`/
`-branches`/`-functions`, disponíveis desde a versão mínima já exigida pelo
`engines` do repo) para os quatro primeiros; `@vitest/coverage-v8` (novo
devDependency) + `coverage.thresholds` em `apps/web/vitest.config.ts` para
o último.

Confirmado que os dois mecanismos realmente bloqueiam (não só reportam):
testado manualmente com um threshold artificialmente alto em cada um,
ambos saem com código != 0 e mensagem de erro explícita.

## Onde a checagem roda

Direto no script `test` de cada workspace — não é um comando separado
(`test:coverage`) nem um step novo de CI. `npm test` (raiz, CI, e o
checklist de qualquer entrega em `tasks/PENDENCIAS.md`/`CONTRIBUTING.md`)
já passa a medir e falhar sob o piso, sem exigir um hábito novo.

## Fora de escopo

- `scripts/*.mjs` (tooling de dev, não código de produto).
- CLI bash (`lib/`) — sem instrumentação de cobertura equivalente para
  Bash configurada neste repositório; ficaria como entrega própria se
  algum dia for decidido.
- Subir os pisos de propósito nesta entrega (ex. escrever testes novos só
  pra aumentar cobertura) — o pedido era medir e travar o piso atual, não
  melhorar cobertura como efeito colateral.

## Arquivos

- `apps/api/package.json`, `packages/core/package.json`,
  `packages/process-manager/package.json`,
  `packages/project-discovery/package.json` — script `test` com flags de
  cobertura.
- `apps/web/package.json` (script `test` com `--coverage`),
  `apps/web/vitest.config.ts` (`coverage.thresholds`),
  `apps/web/package.json` devDependency `@vitest/coverage-v8`.
- `CONTRIBUTING.md` — nova seção "Cobertura" em "Testes".
- `CLAUDE.md` — nota no guia rápido de comandos.

## Verificação

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm test
```

Todos os workspaces passam com os pisos atuais (medidos antes de definir o
threshold, então não há folga artificial nem regressão introduzida por
esta entrega).
