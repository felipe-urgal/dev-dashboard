# Próxima atividade

Nenhuma entrega sequencial está aprovada no momento.

A task mais recente concluída foi a **133 — Política de migração e backup
do estado local** (ver `tasks/133-local-state-backup-policy.md`): novo par
de comandos `dev-backup`/`dev-restore` no CLI bash (`lib/backup/`),
empacotando `~/.config/dev-dashboard` (sem o token da API) e
`~/.local/state/dev-dashboard` num `.tar.gz` portátil, com confirmação
antes de restaurar. Decisão do usuário: comando novo, não só documentação.
Também corrigido, nas cinco repositories de `packages/core`, o
comportamento em mismatch de versão de schema — antes descartava o
arquivo silenciosamente (ou, no caso do `WorkspaceRepository`, derrubava
qualquer rota de workspace com 500) — agora guarda uma cópia do arquivo
original ao lado (`<arquivo>.unreadable-<timestamp>.bak`) e avisa antes de
recriar com os valores padrão.

Antes dela, a task 132 — Estratégia de compartilhamento de regras entre
CLI bash e dashboard web (ver `tasks/132-cli-web-shared-rules-strategy.md`)
extraiu a detecção de tipo de projeto (Rails/Node) para
`shared/project-type-rules.json`, corrigindo uma divergência real entre os
dois lados. E a task 131 — Atalho `coverage-summary.json` (Node) como
fallback (ver `tasks/131-coverage-summary-json-fallback.md`) fechou a
frente de cobertura de testes aberta nas tasks 128-130.

Isso fecha a lista de itens que vinham sendo trabalhados nesta sessão.
Resta em `tasks/PENDENCIAS.md`: compatibilidade com macOS (task 113 já
mapeia o que falta) e migração automática de schema quando houver uma
mudança real de versão.
