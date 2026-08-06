# Próxima atividade

Nenhuma entrega sequencial está aprovada no momento.

A task mais recente concluída foi a **132 — Estratégia de compartilhamento
de regras entre CLI bash e dashboard web** (ver
`tasks/132-cli-web-shared-rules-strategy.md`): diferente das tasks
anteriores, este item pedia uma decisão arquitetural, não uma feature de
escopo já definido. Investigação encontrou uma divergência real (não
hipotética) entre a detecção de tipo de projeto do CLI bash e do TS — bash
fazia `grep` por substring "rails" (confundindo `rails-html-sanitizer` com
Rails de verdade), TS já usava nome exato da gem. Decisão do usuário:
extrair só essa regra (detecção de tipo Rails/Node) para
`shared/project-type-rules.json`, um arquivo declarativo lido em runtime
pelos dois lados (`packages/project-discovery/src/project-type-rules.ts` via
`import.meta.url`; `lib/projects/detect.sh` via `jq`, opcional, com
fallback embutido idêntico sem ele) — não um core compartilhado, que
exigiria o CLI bash depender de Node e quebraria o princípio de "sem build
step, sem compilador". Gerenciamento de processo e detecção de capacidades
além do tipo continuam deliberadamente fora — os dois lados já divergiram
demais em escopo/maturidade para uma regra compartilhada fazer sentido ali.

Antes dela, a task 131 — Atalho `coverage-summary.json` (Node) como
fallback (ver `tasks/131-coverage-summary-json-fallback.md`) fechou a
frente de cobertura de testes de projetos gerenciados aberta na task 128
(Node/Istanbul), estendida pela task 129 (SimpleCov/Rails) e pela task 130
(histórico de execuções).

Mais atrás, a task 127 — Executa caso/`describe` específico para runners
Node (`-t`/`--test-name-pattern`) (ver `tasks/127-node-test-name-pattern.md`)
resolveu o item que ficara em aberto desde a task 123; e a task 126 — Expõe
ações mutáveis do gh (criar/editar/fechar/mesclar PR) (ver
`tasks/126-github-cli-mutable-actions.md`) implementou o catálogo fechado de
quatro ações de Pull Request via `gh`, todas com confirmação em duas etapas.

Isso fecha a lista de itens que vinham sendo trabalhados nesta sessão.
Restam em `tasks/PENDENCIAS.md`: política de migração/backup do estado
local, e compatibilidade com macOS (task 113 já mapeia o que falta).
