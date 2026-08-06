# Próxima atividade

Nenhuma entrega sequencial está aprovada no momento; `tasks/PENDENCIAS.md`
está vazio.

A task mais recente concluída foi a **135 — Smoke E2E do round-trip de
tool-calling do assistente de IA** (ver
`tasks/135-ai-tool-calling-smoke-e2e.md`): o double do Ollama usado no
smoke E2E (`apps/web/e2e/fixtures/ollama-double.ts`) passa a emitir
`tool_calls` quando a mensagem do usuário contém um de três gatilhos
determinísticos, cobrindo o caminho completo de `propose_workspace_edit`
(mensagem → painel de revisão → "Aplicar alterações" → edição real em
disco) e de `get_symbol_definition`/`get_symbol_references` (round-trip da
ferramenta até o log de atividade do painel, sem precisar de um language
server real — o caminho "indisponível" já valida a mesma plumbing).

Por decisão explícita do usuário, os outros dois itens que estavam em
`tasks/PENDENCIAS.md` (migração automática de schema quando existir um
`version: 2` real; validação em macOS real do que a task 134 implementou
só com testes simulados) foram removidos da lista de pendências — ambos
seguem bloqueados por pré-condições que não existem neste ambiente
(nenhuma mudança de schema real ainda, sem acesso a uma máquina macOS), e
o contexto de cada um continua registrado em `tasks/133-local-state-backup-policy.md`
e `tasks/134-macos-process-identity.md` caso precisem ser retomados no
futuro.

Antes dela, a task 134 — Identidade de processo no macOS + cobertura de
`_dev_os` e a task 133 — Política de migração e backup do estado local
fecharam a frente de "Distribuição, governança e compatibilidade" aberta
mais cedo nesta sessão.

Sem itens pendentes registrados, a próxima atividade depende de uma nova
direção do usuário.
