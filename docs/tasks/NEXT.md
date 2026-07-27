# Próxima atividade — 025: Git pull e push

## Contexto

A task 016 entregou criar e trocar de branch com confirmação obrigatória e
validação de árvore limpa. O roadmap (Horizonte 2, "Git em etapas") lista pull
e push como a próxima mutação, antes de avançar para commit e stash.

## Objetivo

Permitir pull e push do branch atual a partir do detalhe do projeto, com a
mesma política de confirmação e validação de árvore de trabalho já usada nas
mutações de branch, sem introduzir um terminal genérico disfarçado.

## Plano detalhado

1. Modelar as respostas e erros de `git pull`/`git push` no contrato
   compartilhado, reaproveitando o formato de confirmação já existente em
   `GitMutationConfirmation`.
2. Implementar os métodos correspondentes em `GitService`
   (`apps/api/src/services/git-service.ts`), tratando de forma explícita:
   remoto/upstream ausente, divergência que exige merge/rebase manual,
   autenticação de remoto indisponível e árvore de trabalho suja.
3. Expor rotas privadas em `apps/api/src/routes/projects.ts` (ou arquivo
   dedicado de Git) seguindo o catálogo fechado de ações e a confirmação por
   risco já usada em `016-git-branch-mutations.md`.
4. Adicionar os controles na aba Git do detalhe do projeto
   (`ProjectDetailsView`/painel de Git), reaproveitando `<Card>` e
   `<StatusBadge>` da reforma visual.
5. Registrar a mutação no histórico de atividade unificado, na mesma linha das
   mutações de branch.
6. Cobrir com testes de API (sucesso, divergência, remoto ausente) e ao menos
   um teste montado do painel de Git para o novo fluxo.

## Fora do escopo

- Configuração de múltiplos remotos ou autenticação de credenciais no
  navegador.
- Resolução de conflitos de merge assistida.
- Commit e stash (próxima entrega da série).
- Rebase interativo.

## Critérios de aceite

- pull e push exigem confirmação explícita e recusam árvore suja, como as
  mutações de branch já entregues;
- erros de remoto/divergência aparecem como mensagens específicas, não como
  falha genérica;
- a mutação aparece no histórico de atividade;
- `npm run typecheck`, `npm run build` e `npm test` passam com os novos
  testes de API e de componente.
