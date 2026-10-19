# Prévia de lifecycle por projeto — fase somente leitura

A issue #1116 introduz um contrato e endpoint para **planejar**, sem executar, a inicialização e a parada dos serviços explicitamente vinculados na #1115.

## Endpoint

`GET /api/projects/:projectId/service-plan?action=start|stop&environmentInstanceId=...&expectedPlanHash=...`

Autenticação local existente do Dashboard. `environmentInstanceId` omitido seleciona o ambiente primário no host. `expectedPlanHash` é opcional para reconsultar e verificar se uma prévia recebida anteriormente ainda descreve exatamente as mesmas observações; alteração resulta em **409 CONFLICT**. Não há endpoint de confirmação nem de execução.

## Significado do plano

- `target`: projeto e Environment Instance, nunca uma autorização para operar no sistema.
- `order`: dependências primeiro em `start`, ordem inversa em `stop`.
- `nodes[].disposition`: `willStart` / `willStop` (somente **intenção calculada**), `alreadyReady`, `retained`, `blocked` ou `unsupported`.
- `readiness` diferente de `running`: serviço ativo sem health evidenciada não passa como pronto para Start.
- `consumerCount`: consumidores configurados do mesmo recurso em projetos/ambientes distintos. Start/Stop de dependências compartilhadas não assume controle do host.
- `ports`: portas declaradas no catálogo e evidências do Port Inspector; porta ocupada ou marcada com conflito bloqueia a prévia correspondente quando relevante.
- `expectedRevision`: revisão atual dos vínculos. `planHash`: impressão da revisão, bindings, topologia implícita por dependências, observações, portas e ação.
- `observedAt` e `expiresAt`: janela de até 30 segundos para a evidência. Uma consulta hash-validada **não reserva** recursos e não torna mutação segura sem nova verificação atômica.
- `executable: false`: garantia explícita da primeira fase; mesmo `status: ready` apenas significa ausência de bloqueios conhecidos na prévia, **não** que a UI possa executar.

## Proteções

1. A seleção de projeto/ambiente é resolvida pelo backend e rejeita referências cruzadas ou Dev Containers.
2. Um serviço `required` ou `observed` de outro projeto é retido no Stop. Apenas serviço `owned` com ownership comprovado pode aparecer como candidato a parada.
3. Um serviço compartilhado ou com dados de estado ausentes fica retido/bloqueado.
4. Dependências faltantes, referências stale, ciclos, falha de readiness, providers incompletos e portas em conflito bloqueiam o plano (fail-closed).
5. Não são usados `sudo`, shell, comandos arbitrários ou auto-associação por nome/porta.
6. Processo gerenciado parado **não** ganha Start automático; o Process Manager é o dono do lifecycle.

## Limites atuais e próxima fatia da #1116

Este PR entrega o **preflight de Project + Environment Instance** e não modifica os executores de Stacks/Compose/Process Manager. As próximas atividades da #1116 abrangem alvo Stack, confirmação de revisão e hash imediatamente antes da mutação, bloqueio exclusivo por recurso físico, execução em steps e auditoria/reattach do Activity/Jobs. Esses mecanismos precisam ser implementados e testados antes de habilitar uma ação única de Start/Stop. Nenhum serviço real foi alterado nesta implementação.

Referências: #1113, #1114, #1115, #1116, #1072.
