# Port Registry e Allocator

O Port Registry complementa o `PortInspectorService`. O Inspector responde ao estado **observed** da máquina; o Registry modela também o que foi **reserved** e **declared** para permitir reconciliação explícita entre projetos, infraestrutura, Compose, Worktrees e Stacks.

## Fontes separadas

Os contratos compartilhados em `packages/contracts/src/port.ts` mantêm três fontes independentes:

- `ReservedPort`: reserva operacional/global, com `scope`, owner/role opcionais;
- `DeclaredProjectPort`: intenção de um projeto/role, acompanhada de source e confidence;
- `ObservedPort`: ocupação efetiva com ownership classificado como projeto, processo externo ou desconhecido.

Não se converte uma fonte na outra por heurística. Em especial, nome de processo externo não prova ownership de projeto.

## Reconciliação

`apps/api/src/services/port-registry-service.ts` é a regra canônica: recebe snapshots das três fontes e produz estados explícitos:

- `available`;
- `expected`;
- `conflict`;
- `reserved-by-other`;
- `unexpected`;
- `unknown-owner`;
- `duplicate-declaration`;
- `stale-declaration`.

Reservas com `role` são reconciliadas pela identidade `projectId + role`. Uma reserva `home-music/api`, por exemplo, não é considerada pertencente a uma declaration `home-music/web` apenas porque compartilha o mesmo projeto. Reservas do projeto sem `role` continuam valendo no escopo do owner inteiro.

O serviço não executa shell, não consulta processos e não mata nada. O Port Inspector permanece responsável pela observação do host e adapta somente evidência já validada pelo Process Manager: server settings conhecidos viram `DeclaredProjectPort`, processos gerenciados associados por PID viram `ObservedPort` com owner de projeto e sockets sem associação verificável continuam com owner `unknown`.

A resposta pública de `GET /api/ports` continua compatível. A integração usa a reconciliação canônica internamente para decidir `conflict` e usa o allocator canônico para `suggestedPort`; não foi criada uma segunda tela nem uma segunda heurística de colisão.

O Inspector também aceita `reservedPorts` e `declaredPorts` adicionais. Isso permite que configuração importada, Project Profile e providers como Compose usem o mesmo pipeline. Uma porta pode estar sem socket e ainda assim ser conflito quando estiver reservada para outro owner; nesse caso o Inspector mantém `state=available` como observação física, marca `conflict=true` e sugere a próxima porta realmente alocável.

## Docker Compose

O Registry não implementa parser YAML e não chama Docker. `declaredPortsFromResolvedCompose` recebe somente a projeção mínima de portas **já resolvidas** pelo provider que usa `docker compose config --format json` (#588): serviço + porta publicada.

Cada porta resolvida vira `DeclaredProjectPort` com:

- `projectId` do projeto Compose;
- `role` igual ao nome do serviço;
- `source=compose`;
- `confidence=certain`.

Entradas inválidas e duplicatas idênticas são descartadas de forma determinística. Conflitos entre um serviço Compose e uma reserva/declaração de outro owner são então tratados pela mesma reconciliação do restante do produto.

## Allocator puro

`allocatePort` é determinístico e trabalha sobre o mesmo snapshot. Ele:

1. nunca escolhe porta privilegiada abaixo de `1024`;
2. pula qualquer porta observada como ocupada;
3. pula reserva sem owner ou pertencente a outro projeto;
4. quando uma reserva tem `role`, só a considera própria se `projectId + role` coincidirem com a solicitação;
5. pula declaration ativa que não pertença ao mesmo `projectId + role` solicitado;
6. permite reutilizar somente reservation/declaration do próprio owner/role;
7. procura em ordem crescente dentro da janela solicitada e retorna uma explicação da escolha.

Essa distinção impede que dois serviços do mesmo projeto — por exemplo `web` e `api` — sejam alocados na mesma porta só porque compartilham `projectId`.

No Port Inspector, a sugestão de uma porta alternativa passa pelo mesmo allocator. Uma porta livre, mas já declarada ou reservada por outro owner, também é pulada.

## Lease local antes de iniciar processos

Uma sugestão pura não é suficiente quando dois ambientes são criados quase ao mesmo tempo. `PortAllocationLeaseRegistry` adiciona uma etapa process-local de **escolher + registrar** sem `await` entre as operações.

O contrato `PortAllocationLeaseRequest` exige:

- `leaseId` estável do ambiente/decisão;
- `projectId`;
- `role`;
- porta preferida/janela herdadas de `PortAllocationRequest`.

Enquanto um lease estiver ativo, sua porta é considerada indisponível para todos os outros leases, inclusive outro worktree do mesmo projeto. Repetir o mesmo `leaseId + projectId + role` é idempotente; reutilizar o mesmo `leaseId` com outro owner/role falha; o lifecycle consumidor chama `release` quando deixa de precisar da reserva.

Essa API é reutilizável diretamente por Worktrees (#570), Stacks (#592) e Compose (#588). Ela reduz race conditions dentro da instância da API, mas **não é um lock distribuído** e não sobrevive a restart. Persistência/distribuição só deve ser adicionada se existir um lifecycle multi-processo real que consiga liberar reservas de forma segura.

## Import e export de configuração

`PortRegistryConfiguration` é um formato versionado (`version=1`) com:

- `reserved`;
- `declared`;
- `ignoredProjectPaths` opcional para transportar, no mesmo setup de workspace, as regras de ignore já pertencentes ao discovery.

`port-registry-configuration.ts` fornece codec JSON de import/export com:

- limite de tamanho e de quantidade de entradas;
- enums fechados para scope/source/confidence;
- validação de portas e campos textuais;
- saída ordenada e determinística;
- deduplicação apenas de `ignoredProjectPaths` — declarações de porta duplicadas são preservadas para a reconciliação diagnosticá-las.

O Registry deliberadamente **não escolhe um path de arquivo**. Persistência/localização pertencem ao Workspace/Profile, evitando paths hardcoded e evitando que o domínio de portas passe a reimplementar regras de project discovery. O codec pode ser usado por import/export de workspace, arquivo configurado pelo usuário ou outra superfície sem mudar o contrato interno.

## Segurança e limites

- nenhuma resolução automática usa `kill`;
- `reserved` não autoriza firewall/network mutation;
- associações de processo/projeto continuam vindo de evidência verificável do Process Manager/Inspector;
- sockets sem processo gerenciado não ganham ownership de projeto pelo nome do executável;
- o adapter Compose recebe modelo resolvido e nunca lê environment/secrets;
- import não executa conteúdo e descarta campos desconhecidos em vez de promovê-los a evidência;
- leases são process-local e exigem owner/lifecycle explícitos;
- a configuração transporta regras de ignore sem interpretá-las, preservando a separação com `project-discovery`;
- este recorte não altera o schema HTTP de `/api/ports`.
