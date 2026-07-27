# Próxima atividade — 026: Git commit e stash

## Contexto

A task 025 entregou pull e push do branch atual com confirmação e validação
de árvore de trabalho. O roadmap (Horizonte 2, "Git em etapas") lista commit
e stash como a última mutação desta série, antes de avançar para outras
frentes (testes focados, Rails de baixo risco, command palette).

## Objetivo

Permitir commitar as alterações da árvore de trabalho e empilhar/desempilhar
um stash a partir do detalhe do projeto, com a mesma política de confirmação
já usada nas demais mutações Git, sem editor de mensagem de commit livre além
de um campo de texto simples e sem seleção parcial de hunks.

## Plano detalhado

1. Modelar no contrato compartilhado a entrada de commit (mensagem obrigatória,
   limite de tamanho) e a listagem de stashes (`GitStashEntry` com índice,
   mensagem e data), reaproveitando `GitMutationConfirmation` para a
   confirmação de cada mutação.
2. Implementar em `GitService`: `commit` (exige pelo menos um arquivo staged
   ou a opção explícita de incluir todas as alterações rastreadas; recusa
   árvore sem nenhuma alteração), `stashPush` e `stashPop`, tratando de forma
   explícita: nada para commitar, nenhum stash disponível, e conflito ao
   aplicar um stash.
3. Expor rotas privadas em `apps/api/src/routes/projects.ts` seguindo o
   catálogo fechado de ações e a confirmação por risco já usada nas mutações
   anteriores.
4. Adicionar os controles na aba Git do detalhe do projeto
   (`ProjectGitPanel.vue`): formulário de commit (mensagem + toggle "incluir
   todas as alterações") e uma lista simples de stashes com ações empilhar/
   desempilhar.
5. Cobrir com testes de `GitService` (sucesso, árvore limpa sem nada a
   commitar, conflito ao popar stash) e testes de rota; ao menos um teste
   montado do painel para o novo fluxo.
6. Atualizar `docs/roadmap.md` marcando a linha "commit e stash" como
   concluída ao final da task.

## Fora do escopo

- Seleção parcial de hunks ou arquivos individuais no commit (todo commit é
  "tudo staged" ou "todas as alterações rastreadas").
- Edição de mensagens de commits já existentes (amend, rebase interativo).
- Múltiplos stashes nomeados com mensagens customizadas além da padrão do
  Git.
- Resolução assistida de conflitos ao aplicar um stash — um conflito recusa a
  operação com uma mensagem específica, sem tentar mesclar automaticamente.

## Critérios de aceite

- commit e stash exigem confirmação explícita, como as demais mutações Git já
  entregues;
- commit sem nada staged/alterado é recusado com uma mensagem específica, não
  como falha genérica;
- stash pop com conflito é recusado sem deixar a árvore de trabalho em estado
  parcialmente mesclado;
- `npm run typecheck`, `npm run build` e `npm test` passam com os novos
  testes de API e de componente.
