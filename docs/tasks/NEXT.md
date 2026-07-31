# Próxima atividade — 052: remover o enhancer legado da aba Diff

## Contexto

A entrega 050 reimplementou a aba Diff, mas a tela ainda é montada de um jeito
herdado: `installGitDiffPageEnhancer` procura a seção legada
(`.git-tab-page` cujo `h2` é "Diferenças por arquivo") e monta um **segundo app
Vue** dentro dela com `createApp(ProjectGitDiffPage).mount(section)`.

O efeito é visível: ao abrir a aba, o console registra um
`TypeError: Cannot read properties of null (reading 'insertBefore')` — o app
externo perde as âncoras que o app interno substituiu. O erro é anterior à 050
(reproduzível em `main`) e não quebra a tela, mas é ruído permanente e um risco
a cada mudança no painel.

Os enhancers `git-diff-compact-enhancer` (resumo e metadados do patch) também
ficaram inertes depois da 050: seus seletores (`.git-diff-metrics`,
`.git-diff-files-pane`, `.git-diff-viewer`) não existem mais no componente.

## Objetivo

Fazer a aba Diff ser renderizada diretamente pelo `ProjectGitPanel.vue`, sem
app aninhado nem varredura de DOM, e remover o que virou código morto.

## Plano sugerido

1. Mapear como `ProjectGitPanel.vue` monta a seção de diff hoje e trocar a
   seção legada por `<ProjectGitDiffPage :project-id="..." />`.
2. Remover `git-diff-page-enhancer.ts`, `git-diff-page/` e o registro em
   `main.ts`.
3. Avaliar `git-diff-compact-enhancer`: `updateCompactSummary` e
   `updatePatchMetadata` não têm mais alvo; `updateFilters` só ajusta a
   visibilidade do filtro de status e cabe melhor no próprio componente.
4. Conferir os testes que exercitam esses módulos e reaproveitar o que ainda
   descreve comportamento real (`splitLeadingPatchMetadata`, por exemplo).
5. Verificar na app real que o console fica limpo ao abrir a aba.

## Fora do escopo

- mudar o visual da aba Diff entregue na 050;
- mexer nos demais enhancers de DOM (log de testes, diff inline do histórico),
  que continuam com alvo válido.
