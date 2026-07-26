# Próxima atividade — 013: Base de testes da interface

## Contexto

A task 012 encerrou o painel de atividade unificado, incluindo a view Vue
`/activity`, sem introduzir montagem de componentes nos testes — os casos
cobertos são de query builder, formatadores e caminho de rota, com
`fetch` estubado. O roadmap prioriza inaugurar a camada de testes de
componentes montados como próximo passo antes de abrir novas superfícies
mutáveis.

## Objetivo

Introduzir `@vue/test-utils` + jsdom no monorepo com o mínimo de
dependências e usar essa infraestrutura para cobrir os estados
vazio/carregando/erro/sucesso da `ActivityView` recém-entregue, servindo
de modelo para as próximas telas.

## Plano detalhado

1. Adicionar `@vue/test-utils` e `jsdom` como devDeps de
   `apps/web`, ajustar `apps/web/tsconfig.test.json` para incluir a
   pasta `src/views` e utilitários necessários, e configurar
   `--experimental-vm-modules`/`jsdom` no runner de testes atual.
2. Criar `apps/web/test/activity-view.test.ts` cobrindo:
   - estado vazio (sem workspaces/projetos e API retornando lista
     vazia);
   - estado carregando (promise pendente);
   - estado de erro (fetch lançando `ApiRequestError`);
   - estado de sucesso (lista renderizada com filtros e paginação
     acessíveis por labels).
3. Extrair fixtures reutilizáveis para atividades em
   `apps/web/test/support/activity-fixtures.ts`.
4. Documentar em `docs/architecture/overview.md` a nova camada de teste
   e o padrão de estubagem de `fetch`.
5. Atualizar `docs/roadmap.md` marcando o item "testes de componentes
   Vue" e o backlog de qualidade.

## Fora do escopo

- Playwright / smoke E2E (fica para a task seguinte).
- Testar componentes fora da `ActivityView` além do necessário para o
  padrão inicial.
- Adicionar frameworks paralelos (Vitest, Cypress) — reaproveitar o
  `node --test` já em uso.

## Critérios de aceite

- suíte `apps/web` sobe jsdom e monta a `ActivityView` sem tocar em
  rede real;
- pelo menos quatro testes independentes cobrem os quatro estados;
- `npm run typecheck`, `npm run build` e `npm test` passam;
- documentação do padrão atualizada.
