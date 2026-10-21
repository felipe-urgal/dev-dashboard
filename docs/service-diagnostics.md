# Diagnósticos de serviços vinculados (read-only)

A issue #1119 reutiliza log readers e Activity/Jobs, sem um novo armazenamento. A rota autenticada `GET /api/projects/:projectId/services/:serviceRef/diagnostics?environmentInstanceId=...` aceita **somente** identidade canônica do catálogo que esteja vinculada (binding habilitado) à Environment Instance do projeto. Não aceita shell, opções de CLI, PID, path ou nome arbitrário como autoridade.

## Fontes e limites

- `systemd:user` e `systemd:system`: `journalctl [--user] --unit <identidade resolvida> --no-pager --output=short-iso --lines=200 --since=-1 hour`; somente em Linux, timeout de 3 segundos, buffer máximo de 256 KiB, saída devolvida até 64 KiB, mascaramento do Process Manager. Um journal de sistema sem permissão retorna **unavailable** com motivo, nunca `empty`. Nenhum sudo/root ou alteração de boot.
- `compose`: delega a `DockerComposeLifecycleService.logs` do projeto owner com tail 200 e guarda de ownership antes da leitura; não consulta containers externos como se fossem Compose.
- `managed-process`: reusa os leitores de server, worker, webpack e test existentes, após confirmar a identidade persistida. `script` mantém seu proprietário Script Execution.
- `docker` unmanaged: logs não suportados; apenas inventário read-only, sem `docker logs` amplo.
- Os leitores journal e Compose mascaram o conteúdo **antes** de cortar a resposta em bytes; o agregador também mascara antes de seu limite adicional de 64 KiB. O Process Manager descarta a primeira linha incompleta ao ler um tail de arquivo; se não houver linha completa, não devolve seu fragmento e o diagnóstico informa `unavailable` em vez de `empty`. 
- Todos os conteúdos finais têm limite de 64 KiB e passam por redaction adicional no agregador. `observedAt` e `readAt` não são equivalentes; `stale` (>30 segundos) indica que o estado atual precisa ser reobservado. Erros de provider e de Activity degradam independentemente para `partial`. Uma falha inesperada do leitor de journal retorna `source: journal`, `status: unavailable`, `partial: true` sem descartar Activity/Jobs ou expor detalhes internos.
- Até 20 eventos e 20 jobs do Activity existente, filtrados por identidade de recurso e ambiente; o diagnóstico só retorna IDs, action/status e timestamp, sem summary, output bruto ou novo evento. Leitura não cria eventos, evita polling e não propõe replay/rollback. Na timeline, transições distintas do mesmo recurso são preservadas: eventos com Job durável são deduplicados pela identidade de Job + etapa (resource/type/status/ambiente), inclusive após reattach; eventos sem Job usam o ID próprio e não desaparecem somente por repetir ação e status.

## Interface

Projeto → **Diagnóstico** → **Diagnóstico de serviços vinculados**. Ao selecionar um vínculo habilitado e clicar em `Consultar diagnóstico e logs`, a UI faz uma única leitura. Exibe estado/readiness separados, última observação, stale/partial, erros de permissão, log sanitizado e eventos relacionados. Links para providers suportados (Compose e Process Manager) preservam o projeto e, quando aplicável, a Environment Instance. Unidades systemd e containers Docker unmanaged não são encaminhados erroneamente para Process Manager: são apenas observáveis, sem ação de lifecycle. O link para Activity/Jobs filtra ambos os fluxos pelo projeto; eventos de `systemd-user-unit` retornam ao diagnóstico read-only da unidade por `serviceRef`, preservando o ambiente, inclusive em navegação na mesma aba.

## Prontidão e dependências (prévia pontual)

No painel de Diagnóstico, `Verificar dependências` solicita **sob demanda** o plano read-only `GET /api/projects/:projectId/service-plan?action=start&environmentInstanceId=...` existente. O navegador não envia shell, operações de start/stop, novo executor nem autorização de lifecycle. A resposta mantém `executable: false`.

- A contagem **X de Y serviços comprovadamente prontos** corresponde a nós com `alreadyReady` (estado `running` e readiness `ready` verificados pelo planner). `willStart` indica apenas que um início poderia ser planejado; **não significa iniciado, executando ou progresso real**.
- `blocked` e `unsupported` exibem os motivos estáveis do planner. Quando o nó depende diretamente de outro nó bloqueado ou sem suporte, a interface identifica explicitamente a dependência bloqueante; a lista preserva nós ausentes e a ordem topológica da prévia.
- O usuário pode selecionar para consulta de logs apenas a identidade exata de um serviço que tenha binding habilitado no ambiente; identidades ausentes não são redirecionadas para outros serviços e não disparam leitura de logs. Logs continuam sob demanda por clique separado.
- `observedAt` é o horário da **verificação do plano**, não um relógio de execução nem promessa de que a observação individual permanece atual. `expiresAt` e a instrução para revalidar ficam visíveis. Não existe polling automático; uma falha de planejamento exibe indisponibilidade sem substituir a evidência dos logs por sucesso nem expor erro interno.
- A prévia não substitui histórico de steps de Jobs nem expõe duração de execução. Progresso de execução real e causalidade entre eventos `blocked/retained/failed` dependem da integração futura do lifecycle multi-node (#1116/#1117).

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
