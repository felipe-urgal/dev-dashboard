# Próxima atividade

Nenhuma entrega sequencial está aprovada no momento.

A task mais recente concluída foi a **127 — Executa caso/`describe`
específico para runners Node (`-t`/`--test-name-pattern`)** (ver
`tasks/127-node-test-name-pattern.md`): resolve o item que ficara em aberto
desde a task 123, com decisão explícita do usuário de que o padrão de nome
é digitado à mão (sem descoberta automática de `describe`/`it`). Reaproveita
a mesma infraestrutura de "arquivo específico" (`POST
.../tests/:commandId/files/start`) com um campo `namePattern` opcional.
Durante essa entrega, um teste novo pareceu expor um bug de corrida no
`packages/process-manager` — investigação mais a fundo mostrou que era um
falso alarme: um erro na própria chamada de teste (`content-type:
application/json` sem `payload` numa rota de corpo vazio), já presente em
todos os chamados pré-existentes de `.../tests/process/stop`, só nunca
notado antes. Corrigido nos três pontos do arquivo afetado — ver
"Falso alarme investigado durante esta entrega" em
`tasks/127-node-test-name-pattern.md`.

Antes dela, a task 126 — Expõe ações mutáveis do gh (criar/editar/fechar/
mesclar PR) (ver `tasks/126-github-cli-mutable-actions.md`) implementou o
catálogo fechado de quatro ações de Pull Request via `gh`, todas com
confirmação em duas etapas — decisão explícita do usuário, resolvendo o
item que estava em aberto desde a task 114.

Mais atrás, a task 123 — Executa caso/exemplo específico do RSpec
(`arquivo:linha`) (ver `tasks/123-rspec-case-execution.md`) reaproveitou a
mesma infraestrutura de "arquivo específico" já existente para RSpec, sem
mudança de contrato no histórico; entre ela e a task 126, duas correções de
CI no mesmo PR (task 124 alargou a margem dos limiares de cobertura, task
125 corrigiu a causa raiz real do CI vermelho — ver
`tasks/125-test-file-routes-bundle-shim-fix.md`).

Isso fecha a lista de itens que vinham sendo trabalhados nesta sessão. Para
escolher a próxima, veja os itens em aberto em `tasks/PENDENCIAS.md`.
