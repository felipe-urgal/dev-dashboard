# Próxima atividade — 020: Migrar painéis de detalhe do projeto para `<Card>`

## Contexto

Com tokens (018) e `<StatusBadge>` (019) prontos, o próximo passo da
reforma (passo 4 do roteiro em `docs/design/redesign-2026.md`) é
migrar os cinco painéis internos da página de detalhes do projeto
para o `<Card>` compartilhado, unificando cabeçalho, padding e
superfícies.

## Objetivo

Que cada painel (`ProjectServerPanel`, `ProjectGitPanel`,
`ProjectTestsPanel`, `ProjectDatabasePanel`, `ProjectScriptsPanel`)
componha sobre `<Card>` — cabeçalho com `header` + `actions` via
slots, corpo no default. Remover do `styles.css` legado as
declarações duplicadas de cada `.project-*-panel`, mantendo apenas o
que é específico do conteúdo interno de cada painel.

## Plano detalhado

1. Refatorar cada painel para envolver o corpo em
   `<Card padded>` e mover o cabeçalho atual para os slots `header`
   e `actions`.
2. Remover regras `.project-server-panel`, `.project-git-panel`,
   `.project-tests-panel`, `.project-database-panel`,
   `.project-scripts-panel` que só duplicam superfície/padding — o
   `<Card>` já entrega isso.
3. Os cabeçalhos ad hoc (`git-panel-header`, `tests-panel-header`,
   `scripts-panel-header`, `database-panel-header`) viram slot
   `header` + slot `actions`; suas classes específicas somem do
   `styles.css`.
4. Testes montados existentes seguem verdes; adicionar 1 caso por
   painel checando que renderiza dentro de `<Card>` (ex.
   `wrapper.get('.dd-card')`).
5. Comparação visual antes/depois em ambiente rodando; documentar
   qualquer diferença esperada em `redesign-2026.md`.

## Fora do escopo

- Reformular `<StatusBadge>` (já entregue).
- Padrões de formulário, mensagens e empty state — passos 5+ do
  roteiro.
- Toggle de tema / densidade.

## Critérios de aceite

- os cinco painéis passam a compor sobre `<Card>`;
- classes duplicadas removidas do `styles.css`;
- suíte `apps/web` verde com casos adicionais checando `<Card>` em
  cada painel;
- `npm run typecheck`, `npm run build`, `npm test` verdes.
