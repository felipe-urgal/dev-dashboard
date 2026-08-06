# Próxima atividade

Nenhuma entrega sequencial está aprovada no momento.

A task mais recente concluída foi a **134 — Identidade de processo no
macOS + cobertura dedicada de `_dev_os`** (ver
`tasks/134-macos-process-identity.md`): `verifyProcessDirectory`
(`packages/process-manager`) ganhou um ramo para `darwin` usando
`lsof -a -p <pid> -d cwd -Fn` como equivalente ao `/proc/<pid>/cwd` do
Linux — com uma assimetria deliberada: no Linux, falha ao ler `/proc` é
"não confirmado" (bloqueia); no macOS, só uma divergência concreta
reportada pelo `lsof` bloqueia, qualquer falha em rodar/interpretar o
`lsof` degrada para "não verificado, não bloqueia" (mesmo comportamento
histórico da função fora do Linux). `_dev_os` (`lib/core/checks.sh`) ganhou
cobertura dedicada dos ramos `mac`/`other` via um `uname` falso no `PATH`.
**Limite explícito**: nada disso foi validado contra um macOS real — só
com `lsof`/`uname` simulados nos testes; CI continua só em `ubuntu-latest`.

Antes dela, a task 133 — Política de migração e backup do estado local
(ver `tasks/133-local-state-backup-policy.md`) trouxe `dev-backup`/
`dev-restore` no CLI bash e corrigiu a perda silenciosa de configuração em
mismatch de versão de schema nas repositories de `packages/core`. E a task
132 — Estratégia de compartilhamento de regras entre CLI bash e dashboard
web (ver `tasks/132-cli-web-shared-rules-strategy.md`) extraiu a detecção
de tipo de projeto para `shared/project-type-rules.json`.

Isso fecha a lista de itens que vinham sendo trabalhados nesta sessão.
Resta em `tasks/PENDENCIAS.md`: validar num macOS real o que a task 134
implementou só com testes simulados, e migração automática de schema
quando houver uma mudança real de versão (`version: 2`).
