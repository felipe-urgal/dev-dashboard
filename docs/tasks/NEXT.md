# Próxima atividade — 056: remover o enhancer legado da aba Diff

## Contexto

A entrega 052 removeu os enhancers de DOM do Histórico e montou a tela como um
componente Vue de verdade. Sobrou o caso equivalente na aba **Diff**:
`installGitDiffPageEnhancer` procura a seção legada (`.git-tab-page` cujo `h2` é
"Diferenças por arquivo") e monta um **segundo app Vue** dentro dela com
`createApp(ProjectGitDiffPage).mount(section)`.

O efeito é visível: ao abrir a aba, o console registra um
`TypeError: Cannot read properties of null (reading 'insertBefore')` — o app
externo perde as âncoras que o app interno substituiu. O erro é anterior à 050
(reproduzível em `main`) e não quebra a tela, mas é ruído permanente e um risco
a cada mudança no painel.

O `git-diff-compact-enhancer` também ficou inerte depois da 050: seus seletores
(`.git-diff-metrics`, `.git-diff-files-pane`, `.git-diff-viewer`) não existem
mais no componente.

## Objetivo

Fazer a aba Diff ser renderizada diretamente pelo `ProjectGitPanel.vue`, sem app
aninhado nem varredura de DOM, e remover o que virou código morto — o mesmo
caminho já percorrido no Histórico.

## Plano sugerido

1. Trocar a seção legada por `<ProjectGitDiffPage :project-id="..." />` no
   `ProjectGitPanel.vue`, como foi feito com `<ProjectGitHistoryPage />`.
2. Remover `git-diff-page-enhancer.ts`, `git-diff-page/` e o registro em
   `main.ts`.
3. Avaliar `git-diff-compact-enhancer`: `updateCompactSummary` e
   `updatePatchMetadata` não têm mais alvo; `updateFilters` só ajusta a
   visibilidade do filtro de status e cabe melhor no próprio componente.
4. Reaproveitar os testes que ainda descrevem comportamento real
   (`splitLeadingPatchMetadata`, por exemplo).
5. Verificar na app real que o console fica limpo ao abrir a aba.

## Fora do escopo

- mudar o visual da aba Diff entregue na 050;
- mexer nos enhancers que ainda têm alvo válido (log de testes, diff inline do
  resumo do painel Git e do stash).
