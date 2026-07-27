# Task 029 — Eventos em tempo real para execuções de teste

## Status

Concluída.

## Objetivo

Substituir o polling do painel de testes por eventos SSE autenticados para a
execução em andamento (estado + log), reaproveitando o padrão já validado do
catálogo de scripts (task 010) em vez de desenhar um mecanismo novo.

## Escopo entregue

- `TestExecutionEvent` (contrato compartilhado): `{ type: 'state', process:
  ManagedProcess }` ou `{ type: 'log', log: ProcessLogSnapshot }` — ao
  contrário do evento de scripts (que carrega um `ScriptExecution` próprio),
  o evento de teste transmite o `ManagedProcess` bruto, porque é exatamente
  o que o painel já exibia via polling; o histórico persistido (task 028)
  continua sendo uma projeção separada, sincronizada à parte.
- `TestExecutionHistoryService.subscribe`: como `ProcessManager` não emite
  eventos (é um modelo somente-arquivo/poll-friendly, sem `EventEmitter`),
  a "SSE" é implementada como uma ponte servidor: um poll interno de 500ms
  por projeto, que só existe enquanto há ao menos um assinante, comparando o
  snapshot atual com o último enviado e publicando somente diffs de
  estado/log. Ao chegar a um estado terminal (ou se o processo gerenciado
  desaparecer), reconcilia o histórico persistido e encerra os assinantes.
  Mesmos limites do catálogo de scripts: 5 assinantes por projeto, 20 no
  total.
- Rota `GET /projects/:projectId/tests/process/events`, replicando a
  estrutura da rota SSE de scripts (hijack da resposta, heartbeat a cada
  15s, serialização explícita dos campos do contrato para não vazar campos
  internos do `ManagedProcess` como `cwd`/`logPath`/`host`).
- `ProjectTestsPanel.vue`: o polling de 1.5s foi substituído por
  `followProcess()`, um laço com reconexão e backoff exponencial (500ms a
  5s) idêntico ao `followExecution` do `ProjectScriptsPanel.vue` — consulta
  pontual antes de assinar, assina enquanto a execução está em andamento, e
  cai de volta para consulta pontual (com uma mensagem de recuperação) se a
  conexão cair.
- Testes de serviço (assinatura sem execução em andamento, eventos
  imediatos ao assinar, detecção de término via polling com reconciliação
  do histórico, publicação de log só quando o conteúdo muda, limite de
  assinantes), teste de rota (remoção de campos fora do contrato, tradução
  de erro para 404) e teste montado do painel consumindo um stream SSE
  simulado.

## Decisões e limitações

Como o `ProcessManager` não expõe eventos de ciclo de vida do processo, a
implementação não é "push" de ponta a ponta — o servidor faz um poll curto
(500ms) e só transforma isso em push para o navegador. Isso ainda cumpre o
critério de aceite (o painel deixa de esperar o intervalo de 1.5s do cliente
e para de fazer polling quando ninguém está observando), mas expor eventos
nativos do `ProcessManager` para eliminar até esse poll interno é uma
mudança de arquitetura de pacote compartilhado, fora do escopo desta task.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

## Fora do escopo

- Expor eventos nativos de ciclo de vida no `ProcessManager` (eliminaria o
  poll interno do servidor).
- Relatório de cobertura.
- Sintaxe de caso/describe.
- Unificação do histórico de testes com o painel de atividade global.
