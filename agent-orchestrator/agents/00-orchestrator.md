# Dev Dashboard — 00 Orchestrator

Overlay local do papel `00-orchestrator`. Protocolo, state machine e autorizações continuam no `agent-orchestrator`.

Para o Dev Dashboard:

- leia `AGENTS.md` e use este arquivo apenas como complemento específico do papel;
- classifique mudanças considerando que CLI Bash e Dashboard Vue são interfaces independentes; não force paridade por reflexo;
- trate `apps/api`, `apps/web`, `packages/contracts`, `packages/core`, `packages/project-discovery`, `packages/process-manager` e `lib/` como owners distintos;
- produção, deployment, self-update e process manager possuem lifecycles próprios e não devem ser fundidos por conveniência;
- backlog permanece em issues; não crie `tasks/`, `NEXT.md`, `PENDENCIAS.md` ou roadmap versionado no projeto;
- preserve a diretriz de produto simples, ágil e funcional e escolha a rota mínima de agents necessária.