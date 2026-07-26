# Task 010 — Eventos de execução em tempo real

## Status

Concluída em 26/07/2026.

## Resultado

O acompanhamento de uma execução ativa do catálogo passou a usar Server-Sent Events (SSE) autenticado na mesma origem. A API publica eventos fechados de estado e de snapshot de log; o painel não realiza mais polling periódico durante a execução.

A abertura e toda reconexão recuperam primeiro o detalhe e o log pelos endpoints HTTP existentes. Assim, o canal de eventos é uma notificação limitada e descartável, enquanto o histórico persistido continua sendo a fonte determinística após uma lacuna ou reinício.

## Decisões e segurança

- a rota recebe somente `projectId` e `executionId` e passa pela autenticação global antes de assumir a resposta contínua;
- a execução precisa existir e pertencer ao projeto informado;
- são aceitos no máximo cinco assinantes por execução e vinte na instância da API;
- snapshots de log continuam limitados a 262144 bytes e passam pelo mascaramento central;
- atualizações de log são agrupadas em janelas de 200 ms, sem buffer ilimitado por assinante;
- heartbeats a cada quinze segundos mantêm a conexão observável sem carregar dados do projeto;
- a API encerra a assinatura ao concluir a execução, desconectar o cliente ou fechar a aplicação;
- o frontend cancela a conexão ao trocar de projeto ou desmontar o painel e tenta reconectar somente depois da recuperação HTTP;
- o endpoint não aceita comandos, caminhos ou filtros livres e não introduz WebSocket genérico.

## Arquivos alterados

- `packages/contracts/src/script.ts` e `packages/contracts/src/index.ts` — união fechada dos eventos;
- `apps/api/src/services/script-execution-service.ts` — assinaturas limitadas, agrupamento de logs e cleanup;
- `apps/api/src/routes/scripts.ts` — stream SSE autenticado e heartbeat;
- `apps/web/src/api.ts` — cliente de stream com renovação da sessão local;
- `apps/web/src/components/ProjectScriptsPanel.vue` — recuperação HTTP, acompanhamento sem polling e cancelamento por geração;
- documentação de arquitetura, segurança, roadmap e tasks.

## Critérios de aceite

- [x] acompanhamento ativo não depende de polling;
- [x] eventos são isolados por projeto e execução;
- [x] conexões, frequência e payload possuem limites explícitos;
- [x] reconexão recupera estado e log por HTTP;
- [x] assinaturas são encerradas em conclusão, desconexão, troca de projeto e shutdown;
- [x] autenticação, isolamento, limite e cleanup possuem cobertura automatizada;
- [x] typecheck, build e testes passam.

## Revisão de código

A revisão posterior à primeira implementação encontrou três condições de corrida. O agrupamento de logs se comportava como *debounce* e podia adiar indefinidamente uma atualização enquanto o processo produzisse saída contínua; agora a primeira janela permanece agendada e publica no máximo uma vez a cada 200 ms. A abertura do arquivo de log também não era aguardada antes de disponibilizar a execução, e a conclusão podia fechar o SSE antes de todo o conteúdo chegar ao disco. A criação agora aguarda o descritor ficar pronto, e leituras terminais esperam o flush antes do evento final.

Também foi corrigida a recuperação do frontend: falhas reais de leitura do stream encerravam o acompanhamento em vez de entrar no fluxo de reconexão. O painel agora informa a recuperação, usa espera exponencial limitada a cinco segundos e, antes de cada nova conexão, consulta novamente estado e log pelos endpoints HTTP. Falhas durante o bootstrap de uma assinatura removem imediatamente a reserva do assinante para não consumir os limites da instância.

## Limitações

Os eventos cobrem somente as execuções reconhecidas do catálogo. Processos de servidor e testes ainda usam seus mecanismos atuais. SSE não é uma fila durável: clientes que perdem eventos recuperam o snapshot atual e o histórico por HTTP.

## PR

Título: `feat: acompanhar execuções do catálogo em tempo real`

Referência: criada após o commit desta entrega.
