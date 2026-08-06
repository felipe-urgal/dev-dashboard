# Próxima atividade

Nenhuma entrega sequencial está aprovada no momento.

A task mais recente concluída foi a **118 — Abas Terminal e Console do
projeto** (ver `tasks/118-project-terminal-console.md`): shell interativo
via PTY (`node-pty`) para qualquer projeto e `rails console` para projetos
Rails, ambos por WebSocket com xterm.js no navegador. Exceção deliberada e
documentada ao princípio de catálogo fechado de ações — confirmado com o
usuário antes de implementar, dado o impacto no modelo de ameaça (ver
`docs/architecture/security.md`, "Terminal e console do projeto").

Antes dela, a task 117 — Smoke E2E de snapshot/restore de banco de dados
(ver `tasks/117-e2e-database-snapshot-restore.md`) deu ao
`sample-rails-app` um `config/database.yml` + binários `mysqldump`/`mysql`
fake no harness, com três specs novos cobrindo gerar snapshot, restaurar
(com cancelamento) e a ausência da aba quando não há banco detectado.

Para escolher a próxima, veja os itens em aberto em `tasks/PENDENCIAS.md`.
