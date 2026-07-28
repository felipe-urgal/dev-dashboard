# Próxima atividade — 041: git-save no painel Git

## Contexto

A task 040 fechou o item "Configurações e notificações" do Horizonte 2
com a central de avisos locais. O item seguinte do roadmap é a paridade
CLI→Web seletiva, trazendo uma capacidade por vez com política de risco
proporcional. A primeira candidata é o `git-save` do CLI bash
(`lib/git/save/`): add + commit rápido com prefixo padronizado, hoje
exclusivo do terminal.

## Objetivo

Oferecer no painel Git do dashboard web um commit rápido equivalente ao
`git-save`: preparar todas as alterações e commitar com mensagem
prefixada, sob a mesma política de confirmação das mutações Git já
existentes (tasks 025 e 026).

## Plano sugerido

1. Estudar `lib/git/save/` (prefixo, validações, fluxo) e mapear o que é
   transponível para o catálogo fechado da API.
2. Estender a rota de mutações Git com a ação `save`, reutilizando a
   validação de árvore/branch e a confirmação em duas etapas de
   commit/stash (task 026), sem aceitar comandos arbitrários.
3. Expor a ação no `ProjectGitPanel.vue` com o mesmo padrão de risco e
   confirmação dos botões existentes.
4. Publicar a conclusão na central de avisos (task 040) se a operação
   for demorada o suficiente para sair da tela — avaliar se vale na
   fatia inicial.
5. Cobrir com testes de rota (API) e de componente (web), seguindo os
   arquivos das tasks 025/026 como referência.

## Segurança

- Nenhum comando de shell arbitrário: catálogo fechado, `cwd` sempre do
  `ProjectStore`.
- Mensagem de commit validada/limitada; sem interpolação em shell.
- Confirmação explícita antes de qualquer mutação, como nas demais ações
  Git.
- Ler `docs/architecture/security.md` antes de estender a rota.

## Fora do escopo

- `git-pr` (exige revisar o modelo de autorização do GitHub CLI).
- Snapshot/restore de banco, `dev-kill-port`, `dev-clean` (fatias
  próprias do mesmo item do roadmap).
- Push automático após o commit.

## Critérios de aceite

- commit rápido disponível no painel Git com confirmação e feedback;
- nenhuma string arbitrária chega ao `spawn`;
- testes de API e de componente cobrindo sucesso e recusa;
- `npm run typecheck`, `npm run build` e `npm test` passam.
