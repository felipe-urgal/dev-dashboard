# Port Registry e Allocator

O Port Registry complementa o `PortInspectorService`. O Inspector responde ao estado **observed** da máquina; o registry modela também o que foi **reserved** e **declared** para permitir reconciliação explícita antes de futuras integrações com Compose, Worktrees e Stacks.

## Fontes separadas

Os contratos compartilhados em `packages/contracts/src/port.ts` mantêm três fontes independentes:

- `ReservedPort`: reserva operacional/global, com `scope`, owner/role opcionais;
- `DeclaredProjectPort`: intenção de um projeto/role, acompanhada de source e confidence;
- `ObservedPort`: ocupação efetiva com ownership classificado como projeto, processo externo ou desconhecido.

Não se converte uma fonte na outra por heurística. Em especial, nome de processo externo não prova ownership de projeto.

## Reconciliação

`apps/api/src/services/port-registry-service.ts` é uma regra pura: recebe snapshots das três fontes e produz estados explícitos:

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

A resposta pública de `GET /api/ports` continua compatível neste recorte. A integração usa a reconciliação canônica internamente para decidir `conflict` e usa o allocator canônico para `suggestedPort`; não foi criada uma segunda tela nem uma segunda heurística de colisão.

## Allocator

`allocatePort` é determinístico e trabalha sobre o mesmo snapshot. Ele:

1. nunca escolhe porta privilegiada abaixo de `1024`;
2. pula qualquer porta observada como ocupada;
3. pula reserva sem owner ou pertencente a outro projeto;
4. quando uma reserva tem `role`, só a considera própria se `projectId + role` coincidirem com a solicitação;
5. pula declaration ativa que não pertença ao mesmo `projectId + role` solicitado;
6. permite reutilizar somente reservation/declaration do próprio owner/role;
7. procura em ordem crescente dentro da janela solicitada e retorna uma explicação da escolha.

Essa distinção impede que dois serviços do mesmo projeto — por exemplo `web` e `api` — sejam alocados na mesma porta só porque compartilham `projectId`.

No Port Inspector, a sugestão de uma porta alternativa agora passa pelo mesmo allocator. Isso significa que uma porta livre, mas já declarada por outro projeto, também é pulada — comportamento que a antiga busca baseada apenas em sockets ocupados não conseguia garantir.

O allocator apenas **sugere** uma porta. Ele não edita `.env`, Compose, scripts ou configuração do projeto e ainda não persiste a decisão. Reserva transacional/lifecycle para ambientes paralelos deve ser adicionada quando existir um consumidor real (#570/#588/#592), evitando uma persistência abstrata sem owner definido.

## Segurança e próximos passos

- nenhuma resolução automática usa `kill`;
- `reserved` não autoriza firewall/network mutation;
- associações de processo/projeto continuam vindo de evidência verificável do Process Manager/Inspector;
- sockets sem processo gerenciado não ganham ownership de projeto pelo nome do executável;
- import/export de configuração e exposição visual completa da reconciliação permanecem na issue #597 até terem contrato de ownership estável;
- este recorte não adiciona rota nem altera schema HTTP, portanto não cria superfície remota nova para proteger.
