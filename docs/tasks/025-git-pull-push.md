# Task 025 — Git pull e push

## Status

Concluída.

## Objetivo

Permitir pull e push do branch atual a partir do detalhe do projeto, com a
mesma política de confirmação e validação de árvore de trabalho já usada nas
mutações de branch da task 016, sem introduzir um terminal genérico
disfarçado.

## Escopo entregue

- `GitMutationOperation` (`packages/contracts/src/git.ts`) ganhou `'pull'` e
  `'push'`, reaproveitando o mesmo formato de confirmação
  (`GitMutationConfirmation`) já usado para criar/trocar branch — o `target`
  da confirmação é o branch atual, validado no momento da execução para que a
  confirmação expire se o branch mudar entre o preparo e a chamada.
- `GitService.pull`/`GitService.push` (`apps/api/src/services/git-service.ts`)
  tratando de forma explícita: HEAD destacado, upstream ausente, remoto
  "origin" não configurado, divergência que impede fast-forward e rejeição do
  remoto por non-fast-forward. `pull` usa `git pull --ff-only` — nunca cria
  merge automático, então divergências exigem resolução manual (fora do
  escopo). `push` publica o branch em "origin" no primeiro envio quando não
  há upstream configurado.
- Rotas `POST /projects/:projectId/git/pull` e `.../git/push`
  (`apps/api/src/routes/projects.ts`), reaproveitando o catálogo fechado de
  ações e a tradução de erros por código já usada nas mutações de branch.
- Painel de Git do detalhe do projeto (`ProjectGitPanel.vue`) ganhou uma seção
  "Sincronizar com origin" com os botões Pull/Push, cada um com confirmação
  explícita do navegador antes de disparar a mutação.
- Testes de `GitService` cobrindo sucesso, HEAD destacado, upstream ausente,
  remoto ausente, árvore suja, divergência e rejeição do remoto (com
  repositórios `origin`/clone reais em diretórios temporários); testes de
  rota para os novos endpoints; teste montado do painel cobrindo o fluxo de
  sucesso do pull e o erro específico de push rejeitado.

## Decisões e limitações

Diferente de criar/trocar branch, `push` não exige árvore de trabalho limpa —
push só envia commits já registrados, não toca no working tree. `pull`
mantém a mesma exigência de árvore limpa das demais mutações.

Mutações de Git (branch, pull, push) continuam fora do painel de atividade
unificado. A task 016 já não as registrava lá, e estendê-las agora exigiria
decidir o modelo de histórico de mutações Git — item já listado no roadmap
("confirmação por risco e histórico das mutações") como entrega futura
separada, não uma extensão implícita desta task.

Não há suporte a múltiplos remotos, autenticação de credenciais no navegador
ou resolução assistida de conflitos — como já previsto no roadmap para esta
série de entregas.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

## Fora do escopo

- Configuração de múltiplos remotos ou autenticação de credenciais no
  navegador.
- Resolução de conflitos de merge assistida.
- Commit e stash (próxima entrega da série).
- Rebase interativo.
- Histórico de mutações Git no painel de atividade unificado.
