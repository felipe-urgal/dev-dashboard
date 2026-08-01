# Task 058 — Remover o enhancer legado da aba Diff

## Status

Implementação concluída. `typecheck`, `build` e `test` (web) aprovados.

## Objetivo

A entrega 052 já tinha feito esse mesmo trabalho para o Histórico: trocar o
enhancer que varria o DOM e montava um segundo app Vue dentro da seção legada
por um componente Vue de verdade, renderizado diretamente pelo
`ProjectGitPanel.vue`. A aba Diff ainda usava o caminho antigo —
`installGitDiffPageEnhancer` procurava a seção `.git-tab-page` (identificada
pelo `h2` "Diferenças por arquivo") e montava `ProjectGitDiffPage` dentro
dela com `createApp(...).mount(section)`, um app aninhado dentro do app
principal. O sintoma era um `TypeError: Cannot read properties of null
(reading 'insertBefore')` no console toda vez que a aba abria.

## Resultado

- `ProjectGitPanel.vue` renderiza `<ProjectGitDiffPage :project-id="..." />`
  diretamente (mesmo padrão já usado para `<ProjectGitHistoryPage />`); a
  seção `.git-tab-page` inline (com seu próprio estado de `diff`/`fileDiff`/
  `loadingDiff`/`loadingFile` e as funções `loadDiff`/`loadFileDiff`) foi
  removida do componente pai — `ProjectGitDiffPage` já busca seus próprios
  dados a partir de `projectId`, como o Histórico já fazia;
- `reloadGitData` não recarrega mais um "diff" que não existe mais no pai;
  isso já era o comportamento aceito para o Histórico (não é recarregado por
  mutações do painel), então a aba Diff passou a seguir a mesma convenção;
- removidos por completo: `git-diff-page-enhancer.ts`, o diretório
  `git-diff-page/` (o `createApp().mount()` aninhado), `git-diff-compact-enhancer.ts`
  e o diretório `git-diff-compact/` — os alvos de `updateCompactSummary` e
  `updatePatchMetadata` (`.git-diff-metrics`, `.git-diff-viewer`) não existem
  mais no componente atual desde a 050;
- `updateFilters` (ocultar o filtro de status quando só há um arquivo
  alterado) ainda tinha alvo real — virou um `computed` nativo
  (`hasSingleChangedFile`) em `ProjectGitDiffPage.vue`, com `v-if` no filtro
  e a classe `has-single-diff-file` aplicada via `:class`, no lugar da
  varredura de DOM;
- `splitLeadingPatchMetadata` (função pura, sem alvo de DOM) foi realocada
  para `utils/split-leading-patch-metadata.ts` — o teste que a cobre migrou
  junto, sem mudança de comportamento;
- CSS morto removido de `ProjectGitPanel.css` (`.git-tab-page`,
  `.git-page-heading`, `.git-diff-layout-modern` e as regras que só existiam
  para eles); `git-diff-compact-enhancer.css` **não** foi tocado — seus
  seletores `!important` (`.git-diff-page`, `.git-diff-toolbar`, etc.) ainda
  têm alvo real no componente atual e fazem parte do visual entregue na 050,
  fora do escopo desta limpeza.

## Fora do escopo

- mudar o visual da aba Diff entregue na 050 — inclusive o CSS de
  `git-diff-compact-enhancer.css`, mantido como está;
- os enhancers que ainda têm alvo válido fora da aba Diff
  (`git-diff-header-cleanup`, `git-diff-syntax-enhancer`: diff inline do
  resumo do painel Git e do stash).

## Arquivos principais

- `apps/web/src/components/ProjectGitPanel.vue`
- `apps/web/src/components/ProjectGitPanel.css`
- `apps/web/src/components/ProjectGitDiffPage.vue`
- `apps/web/src/main.ts`
- `apps/web/src/utils/split-leading-patch-metadata.ts` (novo)

## Testes

- `apps/web/test/project-git-panel.test.ts` — as duas asserções que liam a
  marcação legada (`.git-diff-layout-modern`, texto "Nenhum arquivo alterado
  desde HEAD") foram trocadas por um smoke test: a aba Diff renderiza
  `.git-diff-page` e não sobra nenhum `.git-tab-page`. O comportamento real
  do Diff (arquivos, busca, contexto, syntax highlight) já tinha cobertura
  própria e completa em `project-git-diff-page.test.ts`;
- `apps/web/test/split-leading-patch-metadata.test.ts` (renomeado de
  `git-diff-compact-enhancer.test.ts`) segue cobrindo a função pura.

## Próxima atividade

Descrita em `docs/tasks/NEXT.md`.
