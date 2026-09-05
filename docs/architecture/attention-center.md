# Central de Atenção

A Central de Atenção é uma projeção **read-only** de sinais já pertencentes a outros domínios. O objetivo é responder “o que precisa de ação agora?” sem criar uma segunda fonte de verdade para Git, Processos, Testes, Produção ou Project Doctor.

## Contrato

O contrato público vive em `packages/contracts/src/attention.ts`.

`WorkspaceAttention` contém:

- `workspaceId` e `generatedAt`;
- `partial`, indicando falha em pelo menos uma fonte;
- `unavailableSources`, sem mensagem de erro interna;
- `items`, já ordenados por severidade, projeto e categoria.

Cada `AttentionItem` carrega projeto, categoria, severidade, mensagem, `observedAt` e uma ação de navegação. A ação não representa uma mutação remota ou local.

## Agregação

`AttentionCenterService` consulta em paralelo:

- `ProcessManager` para processos gerenciados;
- `GitService` para o overview Git de cada projeto;
- `TestExecutionHistoryService` para a última execução de testes;
- `ProjectDoctorService` para o diagnóstico atual;
- `ProductionOverviewService` para o estado operacional de produção.

Somente projetos habilitados participam da agregação.

As consultas usam isolamento por fonte. Uma rejeição não cancela as demais: ela entra em `unavailableSources` e o resultado passa a `partial=true`. Mensagens de exceção não são copiadas para o contrato público.

## Regras de severidade

As regras são deliberadamente pequenas e testáveis:

| Fonte | Condição | Severidade |
|---|---|---|
| Processo | `failed` ou `stopped` com exit code != 0 | critical |
| Git | `ahead > 0` e `behind > 0` | critical |
| Git | dirty ou behind sem divergência | warning |
| Testes | última execução falhou ou parou com exit code != 0 | critical |
| Doctor | `overallStatus=blocked` | critical |
| Produção | `failed` ou `recovery-required` | critical |

A ausência de um sinal nessas regras não deve ser interpretada como uma nova regra implícita.

## Frescor e resolução

A central não persiste itens. Cada leitura reconstrói a projeção a partir das fontes atuais, por isso uma condição resolvida desaparece naturalmente.

`observedAt` preserva o timestamp da fonte quando disponível. Quando a fonte não expõe um timestamp adequado, usa-se `generatedAt` como instante da observação, sem afirmar que o estado remoto mudou naquele momento.

## Determinismo

Como as fontes são lidas concorrentemente, tanto `items` quanto `unavailableSources` são ordenados antes da resposta. Isso evita que timing de I/O altere a representação pública.

## Segurança

A camada não chama operações de mutação. Correções continuam nas ferramentas proprietárias de cada domínio, com seus contratos, confirmações e políticas de segurança. A Central de Atenção fornece somente navegação para essas ferramentas.
