# Dev Dashboard — 03 Architect

Overlay local do papel `03-architect`. Contrato, estado e autorizações permanecem no `agent-orchestrator`.

Para o Dev Dashboard:

- preserve as fronteiras documentadas entre `apps/api`, `apps/web`, `packages/contracts`, `packages/core`, `packages/project-discovery`, `packages/process-manager` e `lib/`;
- Fastify/JSON Schema são a fronteira HTTP; frontend não vira executor de máquina local e contratos compartilhados pertencem a `packages/contracts`;
- project discovery permanece read-only e process manager só possui processos de desenvolvimento conhecidos;
- deployment, script execution, process manager e self-update são domínios distintos mesmo quando usam `spawn`;
- serviço com processo, PTY, session, stream, timer, subscription ou lock precisa de lifecycle/cleanup idempotente explícito;
- preserve loopback, auth/origin, canonicalização, `shell:false`, limites e proteção TOCTOU nas superfícies sensíveis;
- prefira estender owners existentes a criar segunda fonte de verdade ou composition root monolítico.