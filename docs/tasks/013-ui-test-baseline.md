# Task 013 — Base de testes de UI

## Status

Concluída.

## Objetivo

Inaugurar a camada de testes de componentes montados no frontend,
começando pela `ActivityView` recém-entregue, para servir de modelo às
demais views. Prioridade da auditoria/roadmap: "testes de componentes
Vue".

## Escopo entregue

- Runner de testes do `apps/web` migrado de `node --test` para
  `vitest` com `environment: 'jsdom'` e `@vitejs/plugin-vue`, o que
  permite importar componentes `.vue` sem custom loader. Adicionadas
  devDeps `vitest`, `@vue/test-utils`, `jsdom` e `@types/jsdom`;
  removido `global-jsdom` que só serviria ao runner antigo.
- `apps/web/vitest.config.ts` declara o ambiente e o plugin Vue.
- Testes existentes migrados apenas em uma linha (`import { test } from
  'vitest'`); asserts continuam usando `node:assert/strict`.
- Novo `apps/web/test/support/activity-fixtures.ts` com builders
  reutilizáveis (`makeWorkspace`, `makeProject`, `makeScriptActivity`,
  `makeServerActivity`, `makeActivityList`) para as próximas telas.
- `apps/web/test/activity-view.test.ts` monta a `ActivityView` com
  `@vue/test-utils` e estuba `globalThis.fetch` para exercitar os
  quatro estados priorizados no roadmap:
  - **carregando** — a promise da lista de atividades permanece
    pendente e o estado "Carregando atividades…" aparece;
  - **vazio** — a API responde com lista vazia e a UI mostra "Nenhuma
    atividade encontrada";
  - **sucesso** — atividades de origem distinta são renderizadas com
    label, origem e status formatados;
  - **erro** — `ApiRequestError` é propagado do fetch e a mensagem
    aparece na tela sem sobrescrever a lista.
- `apps/web/test/vue-shim.d.ts` declara módulos `.vue` para o
  typecheck do próprio pacote de testes; `tsconfig.test.json` inclui
  `src/views/**/*.vue` e o tipo `jsdom`.

## Fora do escopo

- Playwright / smoke E2E (task seguinte segundo o roadmap).
- Migrar helpers puros existentes para `expect` do vitest — como o
  runner ainda aceita `assert`, ficam como estão para evitar diff
  incidental.
- Testes montados para outras views além da `ActivityView` — a infra
  fica pronta e o padrão é aplicado incrementalmente conforme cada
  view for tocada.

## Verificação

```
npm run typecheck
npm run build
npm test
```

Suíte do `apps/web` cresce de 12 para 16 casos (4 novos em
`activity-view.test.ts`); demais suítes intactas.

## Sequência posterior

Roadmap: página global de processos (task 014) e, na frente Git,
iniciar por diff somente leitura antes das mutações.
