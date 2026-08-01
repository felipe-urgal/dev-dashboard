# Task 054 — Simplificação do painel de servidor

## Status

Implementação concluída. O painel foi reduzido às áreas operacionais de
configuração e status; as prévias redundantes de atividade e logs foram
removidas junto com suas consultas e polling específicos. `typecheck`,
`build`, suíte completa e teste de montagem direcionado aprovados.

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

## Arquivos principais

- `apps/web/src/components/ProjectServerPanel.vue`
- `apps/web/src/components/ProjectServerPanel.css`
- `apps/web/test/project-detail-cards.test.ts`

## Validação

- `npm run typecheck`
- `npm run build`
- `npm test`

## Limitações

A entrega não altera as telas completas de Atividade e Logs nem o contrato da
API. A remoção se limita às prévias da aba Servidor. A verificação visual em
navegador real não foi concluída neste ambiente: o navegador em nuvem bloqueou
o endereço local com `ERR_BLOCKED_BY_CLIENT` e a instalação local do Playwright
não possui o binário do Chromium. Não foram instaladas dependências adicionais
apenas para essa verificação.
