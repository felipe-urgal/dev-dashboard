# Próxima atividade

Nenhuma entrega sequencial está aprovada no momento.

A task mais recente concluída foi a **126 — Expõe ações mutáveis do gh
(criar/editar/fechar/mesclar PR)** (ver
`tasks/126-github-cli-mutable-actions.md`): catálogo fechado de quatro
ações (`pull-request-create`/`-edit`/`-close`/`-merge`), todas com
confirmação em duas etapas (mesmo padrão de token de uso único das
mutações Git e do catálogo de scripts) — decisão explícita do usuário, que
também resolve o item que estava em aberto desde a task 114
(`docs/architecture/security.md`, "Integração com o GitHub CLI").

Antes dela, a task 123 — Executa caso/exemplo específico do RSpec
(`arquivo:linha`) (ver `tasks/123-rspec-case-execution.md`) reaproveitou a
infraestrutura de "arquivo específico" já existente, sem mudança de
contrato no histórico. Node (`node --test`/Jest/Vitest) e persistência de
relatórios de cobertura de projetos gerenciados ficam como itens próprios
em `tasks/PENDENCIAS.md`.

Entre as duas, duas correções de CI no mesmo PR: task 124 alargou a margem
dos limiares de cobertura (prática defensiva, ver "Cobertura" em
`CONTRIBUTING.md`) e task 125 corrigiu a causa raiz real do CI vermelho — um
teste (task 123) que dependia do binário `bundle` existir de verdade no
runner, sem simulá-lo como já era o padrão em
`database-snapshot-routes.test.ts` (ver `tasks/125-test-file-routes-bundle-shim-fix.md`).

Mais atrás, a task 122 — Mede cobertura e define metas por camada (ratchet)
(ver `tasks/122-test-coverage-thresholds.md`) instrumentou cobertura em
`apps/api`, `packages/core`, `packages/process-manager`,
`packages/project-discovery` (Node) e `apps/web` (Vitest); e a task 118 —
Abas Terminal e Console do projeto (ver `tasks/118-project-terminal-console.md`)
deu um shell interativo via PTY (`node-pty`) para qualquer projeto e
`rails console` para projetos Rails, ambos por WebSocket com xterm.js no
navegador — exceção deliberada e documentada ao princípio de catálogo
fechado de ações, confirmada com o usuário antes de implementar (ver
`docs/architecture/security.md`, "Terminal e console do projeto").

Isso fecha a lista de itens que vinham sendo trabalhados nesta sessão. Para
escolher a próxima, veja os itens em aberto em `tasks/PENDENCIAS.md`.
