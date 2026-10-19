# Serviços vinculados a projetos (somente configuração)

A issue #1115 cria vínculos explícitos de um serviço identificado no catálogo a um `Project` e uma `Development Environment Instance`. **Vincular não inicia, para, reinicia nem adota um serviço.**

## Conceitos

- `owned`: apenas quando o catálogo comprova owner compatível com o projeto e o ambiente (Compose/Process Manager). A escolha deste papel **não concede** privilégios novos.
- `required`: o projeto precisa do serviço, mesmo que outra aplicação seja sua dona. Pode haver vários consumidores.
- `observed`: referência informativa, sem bloqueio operacional. Um vínculo `observed` não pode ser `requiredForStart`.
- `enabled`: ativa o vínculo na **configuração**, não ativa o serviço no host.
- `dependencies`: arestas explícitas de `serviceRef` para `serviceRef`, com origem `manual` ou `compose`. Evidências Compose devem ser confirmadas pelo provider; a sugestão só entra após aceite explícito.
- `stale`: o projeto e ambiente ainda existem, mas o recurso saiu do inventário; `orphaned`: projeto ou ambiente desapareceu. Nenhum deles concede capacidade mutável.
- `shared`: mais de um Project/Environment Instance depende do mesmo `serviceRef`.

## API (autenticada)

- `GET /api/projects/:projectId/service-bindings`: lista vínculos, consumidores compartilhados, availability e revisão SHA-256.
- `GET /api/projects/:projectId/service-bindings/preview?environmentInstanceId=...`: catálogo de candidatos, `linkableAsOwned` e sugestões Compose comprovadas. Não grava.
- `POST /api/projects/:projectId/service-bindings`: cadastra vínculo; requer `expectedRevision`, `serviceRef`, `relation`, `requiredForStart`, `enabled`, `dependencies` e `environmentInstanceId` opcional (padrão: primary).
- `PUT /api/projects/:projectId/service-bindings/:bindingId`: substitui vínculo existente, preservando ID e data de criação.
- `DELETE /api/projects/:projectId/service-bindings/:bindingId?expectedRevision=...`: remove somente a configuração.
- `GET /api/services/bindings/consumers?serviceRef=...`: mostra todos os consumidores conhecidos, inclusive vínculos órfãos.

`expectedRevision` deve ser obtido da listagem atual; em caso de atualização concorrente a API responde `409 CONFLICT` e nada é gravado. Retentativas idênticas com a revisão atual são idempotentes. Requests rejeitam resourceRef que não existe no catálogo observado, erros de ownership, referência de ambiente externo, ciclos, entradas extras não previstas e unit/PID/comando arbitrário.

## Armazenamento e segurança

As declarações usam `project-service-bindings.json` no diretório de estado do Process Manager, com versão de schema 1, arquivo temporário seguido de rename, limites por projeto/global e proteção contra sobrescrever estado desconhecido/corrompido. A remoção de Project ou Environment Instance não faz limpeza automática de serviços reais; os vínculos permanecem visíveis como `orphaned` na consulta por consumidores. A API não aceita shell, comando de sistema nem caminho arbitrário como fonte de autoridade.

A UI visual por projeto será implementada na #1118 e o planejamento de ações em #1116. `required`, `shared` e `owned` são dados declarativos: não são prova de permissão de lifecycle no sistema operacional.

## Cenários de aceitação

1. Loto Lab pode declarar `owned` para um serviço Compose sob seu namespace confirmado.
2. Loto Lab e Controle Gastos podem vincular `required` à mesma referência PostgreSQL sem conceder Start/Stop.
3. Um container externo apenas observado não pode ser cadastrado como `owned`.
4. Alterar o vínculo e repetir a operação com revisão antiga retorna `409`.
5. Um serviço não listado, um ambiente de outro projeto ou um contexto Dev Container não ganham vínculo `owned` de host.
6. A remoção de um projeto torna seus vínculos órfãos, sem interromper qualquer serviço.

Referências: #1113 (epic), #1114 (inventário), #1115 (vínculos), #1116 (planner), #1118 (UI).
