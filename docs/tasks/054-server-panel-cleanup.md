# Task 054 — Simplificação dos painéis de servidor e logs

## Status

Implementação concluída. O painel foi reduzido às áreas operacionais de
configuração e status; as prévias redundantes de atividade e logs foram
removidas junto com suas consultas e polling específicos. `typecheck`,
`build`, suíte completa e testes de montagem direcionados aprovados. O painel
completo de Logs também deixou de reservar uma coluna lateral para estado e
atalhos.

## Objetivo

Deixar a aba **Servidor** mais simples e direta. Atividade e logs já possuem
telas próprias no dashboard, portanto suas prévias ocupavam espaço e
duplicavam informações sem acrescentar uma ação operacional nova.

## Resultado

- removidos os cartões **Atividade recente** e **Últimos logs**;
- removidos os composables, estados, formatadores e atualizações de rede que
  existiam apenas para alimentar essas duas prévias;
- configuração e status passaram a ser os dois filhos diretos da grade, com
  proporção mais equilibrada no desktop e empilhamento abaixo de 1180 px;
- preservados o ciclo completo de iniciar, parar e reiniciar, o polling do
  status do processo e os avisos de conclusão;
- atualizado o teste de montagem para proteger a ausência dos dois blocos.

### Painel de Logs

- removida a coluna lateral, liberando toda a largura para o inspetor de logs;
- status, porta, PID, saída, linhas visíveis e ações rápidas foram reunidos em
  uma faixa horizontal no topo;
- o Resumo Rails virou uma faixa de métricas horizontal própria, exibida
  somente quando existem requisições estruturadas;
- no mobile, métricas, atalhos e resumo se reorganizam em duas colunas ou em
  blocos empilhados, sem overflow horizontal.

## Arquivos principais

- `apps/web/src/components/ProjectServerPanel.vue`
- `apps/web/src/components/ProjectServerPanel.css`
- `apps/web/test/project-detail-cards.test.ts`
- `apps/web/src/components/ProjectLogsPanel.vue`
- `apps/web/src/components/ProjectLogsPanel.css`
- `apps/web/test/project-logs-panel.test.ts`

## Validação

- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm run test --workspace=@dev-dashboard/web -- --run project-logs-panel.test.ts`

## Limitações

A entrega não altera a tela completa de Atividade nem o contrato da API. A
remoção das prévias se limita à aba Servidor; a tela completa de Logs teve
somente sua composição visual reorganizada. A verificação visual em
navegador real não foi concluída neste ambiente: o navegador em nuvem bloqueou
o endereço local com `ERR_BLOCKED_BY_CLIENT` e a instalação local do Playwright
não possui o binário do Chromium. Não foram instaladas dependências adicionais
apenas para essa verificação.
