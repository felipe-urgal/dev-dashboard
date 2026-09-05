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

O serviço não executa shell, não consulta processos e não mata nada. O Port Inspector continuará responsável pela observação do host; uma integração posterior deve apenas adaptar sua saída para `ObservedPort` e apresentar owner esperado versus atual na tela existente.

## Allocator

`allocatePort` é determinístico e trabalha sobre o mesmo snapshot. Ele:

1. nunca escolhe porta privilegiada abaixo de `1024`;
2. pula qualquer porta observada como ocupada;
3. pula reserva sem owner ou pertencente a outro projeto;
4. pula declaration ativa de outro projeto;
5. permite reservation/declaration do próprio projeto;
6. procura em ordem crescente dentro da janela solicitada e retorna uma explicação da escolha.

O allocator apenas **sugere** uma porta. Ele não edita `.env`, Compose, scripts ou configuração do projeto e ainda não persiste a decisão. Reserva transacional/lifecycle para ambientes paralelos deve ser adicionada quando existir um consumidor real (#570/#588/#592), evitando uma persistência abstrata sem owner definido.

## Segurança e próximos passos

- nenhuma resolução automática usa `kill`;
- `reserved` não autoriza firewall/network mutation;
- associações de processo/projeto devem vir de evidência verificável do Process Manager/Inspector;
- import/export de configuração e integração visual ficam na issue #597 até terem contrato de ownership estável;
- API/rotas não foram adicionadas neste primeiro recorte, portanto não existe superfície remota nova para proteger.
