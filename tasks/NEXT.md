# Próxima atividade

Nenhuma entrega sequencial está aprovada no momento.

A task mais recente concluída foi a **131 — Atalho `coverage-summary.json`
(Node) como fallback** (ver
`tasks/131-coverage-summary-json-fallback.md`): fecha o último item da
frente de cobertura de testes aberta na task 128. `ProjectCoverageService`
agora cai para `coverage/coverage-summary.json` (reporter `json-summary`
do Istanbul, com os quatro totais já pré-calculados por arquivo) quando
`coverage/coverage-final.json` não existe ou não pôde ser lido — decisão
explícita do usuário de que o bruto sempre tem prioridade quando os dois
existem, e que a tabela por arquivo continua aparecendo mesmo só com o
formato summary disponível.

Antes dela, a task 130 — Histórico de execuções de cobertura de projetos
gerenciados (ver `tasks/130-coverage-history.md`) adicionou gravação
automática de snapshots (só totais agregados) a cada leitura do relatório,
com retenção de 50 por projeto; a task 129 — Persiste (lê) relatórios de
cobertura de projetos Rails (SimpleCov) (ver
`tasks/129-simplecov-rails-coverage-reports.md`) estendeu o leitor da task
128 para `coverage/.resultset.json`; e a task 128 — Persiste (lê)
relatórios de cobertura de projetos gerenciados (Node/Istanbul) (ver
`tasks/128-managed-project-coverage-reports.md`) implementou o leitor e o
painel originais. Juntas, essas quatro tasks fecham por completo a frente
de cobertura de testes de projetos gerenciados.

Mais atrás, a task 127 — Executa caso/`describe` específico para runners
Node (`-t`/`--test-name-pattern`) (ver `tasks/127-node-test-name-pattern.md`)
resolveu o item que ficara em aberto desde a task 123; e a task 126 — Expõe
ações mutáveis do gh (criar/editar/fechar/mesclar PR) (ver
`tasks/126-github-cli-mutable-actions.md`) implementou o catálogo fechado de
quatro ações de Pull Request via `gh`, todas com confirmação em duas etapas.

Isso fecha a lista de itens que vinham sendo trabalhados nesta sessão. Para
escolher a próxima, veja os itens em aberto em `tasks/PENDENCIAS.md`.
