# Próxima atividade — 029: Eventos em tempo real para execuções de teste

## Contexto

A task 028 entregou histórico persistente de execuções de teste, mas a
atualização continua dependendo de polling (o painel já faz isso a cada
1.5s enquanto uma execução está em andamento). O catálogo de scripts já
resolveu o mesmo problema na task 010 com SSE autenticado
(`ScriptExecutionService.subscribe`, rota
`GET /projects/:projectId/scripts/executions/:executionId/events`,
`followScriptExecutionEvents` no `api.ts` do frontend) — o roadmap lista
isso como o passo seguinte explicitamente posterior ao histórico
persistente ("antes de migrar seus eventos para SSE").

## Objetivo

Substituir o polling do painel de testes por eventos SSE autenticados para
a execução em andamento (estado + log), reaproveitando o padrão já
validado do catálogo de scripts em vez de desenhar um mecanismo novo.

## Plano detalhado

1. Estudar o par cliente/servidor já existente: `ScriptExecutionService.subscribe`
   (limite de assinantes por execução e total, throttle de eventos de log) e
   `followScriptExecutionEvents` (parsing de `text/event-stream`, reconexão
   em 401 via bootstrap de sessão).
2. Adaptar `TestExecutionHistoryService` (ou um serviço companheiro) para
   expor assinatura por execução, já que hoje ele só lê o snapshot atual do
   `ProcessManager` sob demanda — precisa de um jeito de notificar
   mudanças de estado/log sem reintroduzir spawn próprio (o processo
   continua gerenciado pelo `ProcessManager`).
3. Expor uma rota SSE equivalente para testes, com os mesmos limites de
   assinantes simultâneos e autenticação de sessão de navegador.
4. Trocar o polling do `ProjectTestsPanel.vue` pela assinatura SSE enquanto
   uma execução está em andamento, mantendo o polling como fallback se a
   conexão cair (mesmo padrão de resiliência do catálogo de scripts).
5. Cobrir com testes de serviço e de rota (limite de assinantes, eventos de
   estado e log) e ao menos um teste montado do painel para o novo fluxo.

## Fora do escopo

- Relatório de cobertura.
- Sintaxe de caso/describe.
- Unificação do histórico de testes com o painel de atividade global.
- Portar o histórico de scripts para o mesmo serviço de testes ou
  vice-versa — cada catálogo mantém seu próprio armazenamento.

## Critérios de aceite

- o painel de testes reflete o progresso de uma execução em andamento sem
  esperar o intervalo de polling;
- a conexão SSE respeita os mesmos limites de assinantes simultâneos já
  aplicados ao catálogo de scripts;
- perda de conexão não deixa o painel travado — cai de volta para consulta
  pontual;
- `npm run typecheck`, `npm run build` e `npm test` passam com os novos
  testes de API e de componente.
