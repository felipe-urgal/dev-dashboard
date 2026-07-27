# Task 026 — Git commit e stash

## Status

Concluída.

## Objetivo

Permitir commitar as alterações da árvore de trabalho e empilhar/desempilhar
um stash a partir do detalhe do projeto, com a mesma política de confirmação
já usada nas demais mutações Git das tasks 016 e 025, fechando a série "Git
em etapas" do roadmap.

## Escopo entregue

- `GitMutationOperation` ganhou `'commit'`, `'stash-push'` e `'stash-pop'`,
  reaproveitando o formato de confirmação existente — o `target` é o branch
  atual (ou `"HEAD"` quando destacado, já que commitar e guardar/restaurar
  stash não exigem um branch nomeado como pull/push exigem).
- `ProjectGitOverview` ganhou o campo `stashes: GitStashEntry[]`, populado por
  `GitService.getOverview` a partir de `git stash list`.
- `GitService.commit` exige pelo menos um arquivo staged (com a opção
  `includeAllChanges` rodando `git add --update` antes, equivalente a
  `commit -a`) e recusa árvore sem nada staged.
- `GitService.stashPush` recusa guardar quando não há alterações rastreadas
  (arquivos apenas não rastreados não contam, replicando o comportamento
  padrão do `git stash`).
- `GitService.stashPop` sempre restaura o topo da pilha (`stash@{0}`); em
  conflito, a árvore de trabalho é restaurada via `git reset --hard` para o
  commit anterior e o stash é preservado — nunca fica em estado parcialmente
  mesclado.
- Rotas `POST /projects/:projectId/git/commit`, `.../git/stash` e
  `.../git/stash/pop`, seguindo o catálogo fechado de ações e a tradução de
  erros por código já usada nas mutações anteriores.
- Painel de Git do detalhe do projeto ganhou as seções "Registrar alterações"
  (formulário de commit com mensagem + toggle "incluir todas as alterações")
  e "Guardar e restaurar alterações" (lista de stashes existentes + ações
  empilhar/restaurar o mais recente).
- Testes de `GitService` cobrindo sucesso, mensagem inválida, nada para
  commitar/guardar, stash vazio, árvore suja e conflito ao popar (com
  verificação de que a árvore volta a ficar limpa e o stash é preservado);
  testes de rota para os três novos endpoints; testes montados do painel
  para commit bem-sucedido, commit sem nada staged e o ciclo guardar/listar
  stash.

## Decisões e limitações

`stashPop` não permite escolher um stash específico — sempre opera sobre o
mais recente, coerente com "sem seleção parcial" do escopo. Múltiplos
stashes continuam visíveis na lista, mas só o topo é restaurável nesta
entrega.

Diferente de pull/push, commit e stash funcionam em HEAD destacado — não há
remoto envolvido, então a mesma restrição não se aplica.

Como nas tasks 016 e 025, estas mutações continuam fora do painel de
atividade unificado; o modelo de histórico de mutações Git segue como item
separado no roadmap ("confirmação por risco e histórico das mutações").

Esta task fecha a série "Git em etapas" do Horizonte 2. As próximas
prioridades do roadmap passam para outras frentes (testes focados, Rails de
baixo risco, command palette).

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

## Fora do escopo

- Seleção parcial de hunks ou arquivos individuais no commit.
- Edição de mensagens de commits já existentes (amend, rebase interativo).
- Múltiplos stashes nomeados com mensagens customizadas além da padrão do
  Git, ou restauração de um stash específico que não seja o mais recente.
- Resolução assistida de conflitos ao aplicar um stash.
