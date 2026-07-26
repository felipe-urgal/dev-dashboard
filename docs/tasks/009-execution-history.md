# Task 009 — Persistência do histórico de execuções

## Status

Concluída em 26/07/2026.

## Resultado

As execuções reconhecidas do catálogo são persistidas individualmente, em formato versionado, no diretório de estado restrito. A API restaura registros e logs depois de reiniciar, reconcilia registros que ficaram como `running` para `failed` sem enviar sinais a PIDs desconhecidos e ignora corrupção parcial sem indisponibilizar os demais itens.

A listagem paginada aceita somente o identificador do projeto, página e tamanho limitado. O painel apresenta as dez execuções recentes e permite consultar seu detalhe e log protegido; somente a execução ativa continua em polling.

## Decisões e segurança

- arquivos JSON e logs são derivados internamente do UUID e usam permissões `0600`, dentro de diretório `0700`;
- escritas usam arquivo temporário exclusivo e `rename` atômico;
- o estado persistido contém apenas o contrato público, sem caminho, PID ou comando livre;
- retenção padrão de sete dias e limite padrão de 200 registros, configurável por `DEV_DASHBOARD_SCRIPT_HISTORY_LIMIT`;
- registros fora da idade ou quantidade permitida têm JSON e log removidos, inclusive por uma varredura horária enquanto a API permanece ativa;
- o limite de quantidade também é aplicado durante a execução da API, sem depender de um reinício;
- a restauração nunca sinaliza processos e converte órfãos para falha terminal;
- logs restaurados passam pelo mesmo limite e mascaramento das leituras em memória.

## Critérios de aceite

- [x] execuções recentes sobrevivem ao reinício;
- [x] registros ativos órfãos são reconciliados sem sinalizar PIDs;
- [x] histórico possui paginação e retenção limitadas;
- [x] corrupção de um registro não bloqueia os demais;
- [x] rotas aceitam apenas IDs e paginação;
- [x] painel consulta registros terminais sem polling contínuo;
- [x] typecheck, build e testes passam.

## Revisão de código

A revisão anterior à abertura do PR identificou três lacunas na primeira
implementação. A persistência terminal era disparada sem tratamento de rejeição,
o limite quantitativo só era aplicado durante uma futura restauração e o painel
não atualizava a lista ao concluir uma nova execução.

As gravações terminais agora são serializadas por execução, permanecem
observáveis pelas leituras da API e tratam a rejeição no listener do processo sem
produzir uma rejeição global não tratada. A limpeza por quantidade também roda
depois dessas gravações, e o painel recarrega o histórico quando o acompanhamento
termina. A validação da restauração foi endurecida para UUIDs e campos opcionais
válidos, reduzindo a superfície aceita de arquivos manipulados no diretório de
estado.

Na revisão do PR, a retenção por idade passou a participar da limpeza executada
durante toda a vida da API, e não apenas da restauração inicial. A seleção de um
registro terminal também fica bloqueada enquanto houver execução ativa, para não
interromper seu polling nem ocultar a ação de cancelamento.

## Limitações

O histórico cobre as execuções do catálogo seguro; servidores e testes mantêm sua política própria de estado terminal. Não há sincronização, exportação irrestrita, reexecução automática nem suporte multiusuário.

## PR

Título: `feat: persistir histórico de execuções reconhecidas`

Referência: criada após o commit desta entrega.
