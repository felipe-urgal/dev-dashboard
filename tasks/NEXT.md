# Próxima atividade

Nenhuma entrega sequencial está aprovada no momento.

A task mais recente concluída foi a **129 — Persiste (lê) relatórios de
cobertura de projetos Rails (SimpleCov)** (ver
`tasks/129-simplecov-rails-coverage-reports.md`): estende o mesmo endpoint e
painel da task 128 para o formato `coverage/.resultset.json` do SimpleCov,
com duas decisões explícitas do usuário — implementar SimpleCov/Rails agora
(em vez de deixar como item futuro) e, para a diferença de formato entre
Istanbul e SimpleCov (que não distingue statements de lines nem mede
cobertura de função por método), reusar o mesmo objeto de métrica para
`statements`/`lines` e deixar `functions` sempre em `0/0` (100%, "não
medido"). `ProjectCoverageService.getSummary` agora despacha por
`ProjectType` entre os dois leitores.

Antes dela, a task 128 — Persiste (lê) relatórios de cobertura de projetos
gerenciados (Node/Istanbul) (ver
`tasks/128-managed-project-coverage-reports.md`) implementou o leitor e o
painel originais, com três decisões explícitas do usuário: Node/Istanbul
primeiro (SimpleCov ficou para depois — agora resolvido pela task 129), a
API só lê o `coverage/coverage-final.json` que o próprio projeto já gera
(nunca força flags de cobertura), e sem histórico entre execuções (só o
relatório mais recente).

Mais atrás, a task 127 — Executa caso/`describe` específico para runners
Node (`-t`/`--test-name-pattern`) (ver `tasks/127-node-test-name-pattern.md`)
resolveu o item que ficara em aberto desde a task 123, com decisão
explícita do usuário de que o padrão de nome é digitado à mão (sem
descoberta automática de `describe`/`it`); e a task 126 — Expõe ações
mutáveis do gh (criar/editar/fechar/mesclar PR) (ver
`tasks/126-github-cli-mutable-actions.md`) implementou o catálogo fechado
de quatro ações de Pull Request via `gh`, todas com confirmação em duas
etapas.

Isso fecha a lista de itens que vinham sendo trabalhados nesta sessão. Para
escolher a próxima, veja os itens em aberto em `tasks/PENDENCIAS.md`.
