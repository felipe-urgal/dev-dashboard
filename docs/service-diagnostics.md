# Diagnósticos de serviços vinculados (read-only)

A issue #1119 reutiliza log readers e Activity/Jobs, sem um novo armazenamento. A rota autenticada `GET /api/projects/:projectId/services/:serviceRef/diagnostics?environmentInstanceId=...` aceita **somente** identidade canônica do catálogo que esteja vinculada (binding habilitado) à Environment Instance do projeto. Não aceita shell, opções de CLI, PID, path ou nome arbitrário como autoridade.

## Fontes e limites

- `systemd:user` e `systemd:system`: `journalctl [--user] --unit <identidade resolvida> --no-pager --output=short-iso --lines=200 --since=-1 hour`; somente em Linux, timeout de 3 segundos, buffer máximo de 256 KiB, saída devolvida até 64 KiB, mascaramento do Process Manager. Um journal de sistema sem permissão retorna **unavailable** com motivo, nunca `empty`. Nenhum sudo/root ou alteração de boot.
- `compose`: delega a `DockerComposeLifecycleService.logs` do projeto owner com tail 200 e guarda de ownership antes da leitura; não consulta containers externos como se fossem Compose.
- `managed-process`: reusa os leitores de server, worker, webpack e test existentes, após confirmar a identidade persistida. `script` mantém seu proprietário Script Execution.
- `docker` unmanaged: logs não suportados; apenas inventário read-only, sem `docker logs` amplo.
- Todos os conteúdos têm limite de 64 KiB e passam por redaction adicional no agregador. `observedAt` e `readAt` não são equivalentes; `stale` (>30 segundos) indica que o estado atual precisa ser reobservado. Erros de provider e de Activity degradam independentemente para `partial`.
- Até 20 eventos e 20 jobs do Activity existente, filtrados por identidade de recurso e ambiente; o diagnóstico só retorna IDs, action/status e timestamp, sem summary, output bruto ou novo evento. Leitura não cria eventos, evita polling, não propõe replay/rollback e não duplica histórico.

## Interface

Projeto → **Diagnóstico** → **Diagnóstico de serviços vinculados**. Ao selecionar um vínculo habilitado e clicar em `Consultar diagnóstico e logs`, a UI faz uma única leitura. Exibe estado/readiness separados, última observação, stale/partial, erros de permissão, log sanitizado e eventos relacionados. Links para provider e Activity/Jobs preservam o projeto e, quando aplicável, a Environment Instance.

## Matriz de permissão

| Recurso | Observação | Logs | Mutação |
| --- | --- | --- | --- |
| systemd user vinculado | read-only | journal no escopo da sessão | nenhuma |
| systemd system vinculado | read-only | journal somente se permitido pelo host | nenhuma |
| Compose owned e vinculado | read-only | reader Compose existente | nenhuma nova |
| Managed Process owned e vinculado | read-only | reader Process Manager existente | nenhuma nova |
| Docker externo/unmanaged | read-only | unsupported | nenhuma |

## Qualificação

Rodar `npm run check`, E2E de CI e `apps/api/test/systemd-journal-reader.test.ts`, `service-diagnostics-service.test.ts` e `service-diagnostics-routes.test.ts`. Fixtures substituem os runners e nunca tocam serviços reais. Smoke Linux manual opcional: revisar as respostas dos endpoints autenticados, sem alterar ou desabilitar unidades locais.

Issue #1119; observação base #1114 e vínculos #1115.
