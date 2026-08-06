# Próxima atividade

Nenhuma entrega sequencial está aprovada no momento.

A task mais recente concluída foi a **130 — Histórico de execuções de
cobertura de projetos gerenciados** (ver `tasks/130-coverage-history.md`):
estende o mesmo endpoint `GET /projects/:projectId/coverage` das tasks
128/129 para gravar automaticamente um snapshot no histórico a cada leitura
com um relatório disponível (deduplicado por `generatedAt`), com três
decisões explícitas do usuário — gravação automática a cada leitura (sem
ação/endpoint separado), retenção de 50 snapshots por projeto (mesmo padrão
do `TestExecutionHistoryService`), e só os totais agregados por snapshot
(sem detalhamento por arquivo). Novo `GET .../coverage/history` e uma
tabela "Histórico de execuções" no `ProjectCoveragePanel.vue`.

Antes dela, a task 129 — Persiste (lê) relatórios de cobertura de projetos
Rails (SimpleCov) (ver `tasks/129-simplecov-rails-coverage-reports.md`)
estendeu o leitor da task 128 para o formato `coverage/.resultset.json`, com
decisão explícita do usuário de reusar a métrica de `lines` para
`statements` e deixar `functions` sempre em `0/0` ("não medido"). E a task
128 — Persiste (lê) relatórios de cobertura de projetos gerenciados
(Node/Istanbul) (ver `tasks/128-managed-project-coverage-reports.md`)
implementou o leitor e o painel originais.

Mais atrás, a task 127 — Executa caso/`describe` específico para runners
Node (`-t`/`--test-name-pattern`) (ver `tasks/127-node-test-name-pattern.md`)
resolveu o item que ficara em aberto desde a task 123; e a task 126 — Expõe
ações mutáveis do gh (criar/editar/fechar/mesclar PR) (ver
`tasks/126-github-cli-mutable-actions.md`) implementou o catálogo fechado de
quatro ações de Pull Request via `gh`, todas com confirmação em duas etapas.

Isso fecha a lista de itens que vinham sendo trabalhados nesta sessão. Para
escolher a próxima, veja os itens em aberto em `tasks/PENDENCIAS.md`.
