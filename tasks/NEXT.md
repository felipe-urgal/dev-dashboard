# Próxima atividade

Nenhuma entrega sequencial está aprovada no momento.

A task mais recente concluída foi a **128 — Persiste (lê) relatórios de
cobertura de projetos gerenciados (Node/Istanbul)** (ver
`tasks/128-managed-project-coverage-reports.md`): três decisões explícitas
do usuário — Node/Istanbul primeiro (SimpleCov/Rails fica para depois), a
API só lê o `coverage/coverage-final.json` que o próprio projeto já gera
(nunca força flags de cobertura), e sem histórico entre execuções (só o
relatório mais recente). `ProjectCoverageService` computa os quatro
percentuais a partir das contagens brutas do Istanbul sem precisar de uma
dependência nova; painel novo (`ProjectCoveragePanel.vue`) dentro da aba de
testes.

Antes dela, a task 127 — Executa caso/`describe` específico para runners
Node (`-t`/`--test-name-pattern`) (ver `tasks/127-node-test-name-pattern.md`)
resolveu o item que ficara em aberto desde a task 123, com decisão
explícita do usuário de que o padrão de nome é digitado à mão (sem
descoberta automática de `describe`/`it`). Durante essa entrega, um teste
novo pareceu expor um bug de corrida no `packages/process-manager` —
investigação mais a fundo mostrou que era um falso alarme: um erro na
própria chamada de teste (`content-type: application/json` sem `payload`
numa rota de corpo vazio), já presente em todos os chamados pré-existentes
de `.../tests/process/stop`, só nunca notado antes; corrigido nos três
pontos do arquivo afetado.

Mais atrás, a task 126 — Expõe ações mutáveis do gh (criar/editar/fechar/
mesclar PR) (ver `tasks/126-github-cli-mutable-actions.md`) implementou o
catálogo fechado de quatro ações de Pull Request via `gh`, todas com
confirmação em duas etapas; e a task 123 — Executa caso/exemplo específico
do RSpec (`arquivo:linha`) (ver `tasks/123-rspec-case-execution.md`)
reaproveitou a mesma infraestrutura de "arquivo específico" já existente
para RSpec, sem mudança de contrato no histórico.

Isso fecha a lista de itens que vinham sendo trabalhados nesta sessão. Para
escolher a próxima, veja os itens em aberto em `tasks/PENDENCIAS.md`.
