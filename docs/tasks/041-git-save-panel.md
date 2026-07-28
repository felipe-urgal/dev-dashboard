# Task 041 — git-save no painel Git

## Status

Concluída.

## Objetivo

Trazer para o painel Git do dashboard web o commit rápido equivalente ao
`git-save` do CLI bash (`lib/git/save/`): preparar todas as alterações da
árvore de trabalho (incluindo arquivos não rastreados) e commitar com a
mensagem prefixada pelo tipo do branch, sob a mesma política de confirmação
das mutações Git das tasks 025 e 026. Primeira fatia da "paridade CLI→Web
seletiva" do Horizonte 2.

## Escopo entregue

- `GitMutationOperation` ganhou `'save'`, reaproveitando o formato de
  confirmação existente com o branch atual (ou `"HEAD"` quando destacado)
  como `target`.
- `GitService.save` replica a semântica do CLI: valida a mensagem, exige
  confirmação consumível, recusa árvore sem nenhuma alteração
  (`GIT_NOTHING_TO_COMMIT`), roda `git add --all` seguido de
  `git commit -m` via `execFile` (sem shell), e retorna o `GitCommitResult`
  do commit criado.
- O prefixo é derivado do trecho do branch antes da primeira `/`, espelhando
  `_git_branch_prefix` de `lib/git/helpers.sh` (`feature`→`feat`,
  `fix`→`fix`, `refactor`→`refactor`, `chore`→`chore`, `docs`→`docs`,
  `hotfix`→`fix`; qualquer outro tipo — inclusive `main` ou HEAD destacado —
  não recebe prefixo). A mensagem final composta também passa pela validação
  de limite (500 caracteres).
- Rota `POST /projects/:projectId/git/save` com schema fechado
  (`message` 1–500 + `confirmationToken` de 64 caracteres), resposta 201
  reutilizando `gitCommitMutationResponseSchema` e a mesma tradução de erros
  por código das mutações anteriores.
- `ProjectGitPanel.vue` ganhou a seção "Salvar tudo (git-save)" com o mesmo
  padrão de risco: pré-visualização do prefixo derivado do branch atual
  (espelho client-side apenas informativo; o servidor é a autoridade),
  `window.confirm` descrevendo que arquivos não rastreados serão incluídos,
  confirmação em duas etapas via
  `/git/mutations/confirmations` e recarga de overview + diff após sucesso.
- Testes de `GitService` (prefixo aplicado incluindo arquivo não rastreado,
  branch sem tipo conhecido, árvore limpa, sem confirmação — verificando que
  nada é staged —, mensagem inválida), de rota (201 com assunto prefixado,
  409 para árvore limpa e para confirmação ausente) e de componente
  (confirmação `save` com o branch correto antes da mutação e erro exibido
  na recusa da API).

## Decisões e limitações

- Diferente do formulário de commit da task 026, o `save` não tem toggle:
  sempre prepara tudo (`git add --all`), fiel ao `git add .` do CLI. Quem
  quiser commitar apenas o que está staged continua usando a seção
  "Registrar alterações".
- A publicação na central de avisos (task 040) ficou fora desta fatia: a
  operação é síncrona e rápida (sem rede), então o feedback inline do painel
  é suficiente. Se um dia o save ganhar etapas demoradas, a integração pode
  ser reavaliada.
- Sem push automático após o commit, conforme o escopo — o botão Push da
  seção "Sincronizar com origin" continua sendo o caminho.
- `git-pr`, snapshot/restore de banco, `dev-kill-port` e `dev-clean`
  permanecem como fatias próprias do mesmo item do roadmap.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

## Fora do escopo

- Seleção parcial de arquivos ou hunks.
- Personalização do mapa de prefixos por projeto.
- `git-pr` e demais capacidades do CLI listadas no roadmap de paridade.
