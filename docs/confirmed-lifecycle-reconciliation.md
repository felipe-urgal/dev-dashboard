# Reconciliação de lifecycle confirmado — diagnóstico somente leitura

Esta fatia da [#1116](https://github.com/felipe-urgal/dev-dashboard/issues/1116) oferece uma visão **observacional** dos Jobs persistidos na #1131 e de seus recursos atuais no catálogo de serviços. Não inicia/paralisa processos, não altera registros de Jobs, não apaga locks e não faz replay de etapas.

## Endpoints autenticados

- `GET /api/projects/:projectId/service-jobs` lista até 100 resumos persistidos do projeto (incluindo Jobs parciais e concluídos) sem tokens de confirmação, hashes de plano ou comandos.
- `GET /api/projects/:projectId/service-jobs/:jobId/reconciliation` fornece diagnóstico por serviço, restrito ao projeto dono da execução. Jobs inexistentes ou de outros projetos são tratados como 404.

Ambos usam a autenticação local existente do Dashboard e somente métodos GET. Não há rota POST de recuperação, `cancel`, `resume` nem `retry`.

## Como interpretar o relatório

- `journalState`: o que o Journal gravou (`not-attempted`, `in-flight`, `completed`, `failed`, `unverified`).
- `observedState` e `readiness`: evidências atuais do catálogo, que podem estar desatualizadas ou indisponíveis.
- `assessment`: `matches-target`, `diverged` ou `unverifiable`. Mesmo `matches-target` **não prova** quem executou a operação ou quando ela ocorreu.
- `possibleActiveExecution`: verdadeiro enquanto o Job do journal estiver `running`. Uma instância anterior da API pode continuar executando e nenhum sistema deve excluir seus locks por suposição.
- `observationComplete`: só é verdadeiro quando o catálogo não está truncado e todos os providers reportam status ready.
- `reconciliationRequired`: evidências incompletas, execução não terminal, falha parcial ou divergência exigem revisão humana.
- **`safeToRetry: false` em qualquer resposta**. O diagnóstico não concede autorização para repetir a operação nem para retirar lease de um processo possivelmente ativo.

A associação entre observação e Job exige o mesmo identificador de recurso, ownership confirmado e correspondência ao projeto e Environment Instance (a ausência de Environment Instance no catálogo somente corresponde ao ambiente primário do projeto). Recursos ausentes, duplicados, pertencentes a outro projeto, `unmanaged`, estados intermediários ou readiness não comprovada são `unverifiable`.

Nenhuma string bruta de erro do provider é exposta. Uma falha de consulta ao catálogo torna o diagnóstico inconclusivo, mas preserva os dados do Job.

## Procedimento de recuperação futura

1. Conferir se alguma instância anterior da API ainda está em execução e inspecionar os leases físicos.
2. Comparar o Journal, a topologia Compose e os estados de runtime, verificando impactos em serviços compartilhados.
3. Reconciliar manualmente operações parciais/indeterminadas antes de autorizar uma nova confirmação.
4. Retomar a iniciativa como uma **nova operação**, somente após nova análise de ownership, planos e locks e com confirmação explícita.

Esta entrega não automatiza essas etapas. Cancelamento/timeout, finalização auditável de registros incertos e reattach real permanecem pendentes na #1116; a UI não deve tratar o relatório como permissão para Start/Stop.

## Cobertura de testes

Casos: Job em execução cujo serviço aparenta estar pronto, divergência após Job concluído, catálogo indisponível/parcial, serviço ambíguo/unmanaged/de outro projeto, isolamento HTTP por projeto, autenticação e ausência de mutações.

## Validação de segurança do endpoint

O diagnóstico é refeito a cada GET e não altera o Journal. Respostas de projetos diferentes não permitem descobrir Jobs alheios. Uma consulta com providers indisponíveis produz informação inconclusiva, não autorização. O contrato deve continuar explicitando `safeToRetry: false` mesmo quando o runtime aparentar atender ao plano.
