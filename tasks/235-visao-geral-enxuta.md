# Task 235 — Visão geral enxuta

**Status:** concluída em 2026-08-11.

## Objetivo

Reduzir a densidade da Visão geral e separar melhor ações de manutenção do
workspace das ações globais de servidor.

## Resultado

- removida a busca textual da lista de projetos na Visão geral;
- removido o filtro por tipo (Todos/Rails/Node) da Visão geral;
- a lista volta a exibir diretamente todos os projetos detectados, preservando
  a ordenação por prioridade;
- os controles globais de iniciar e parar servidores foram movidos para junto
  do título e da contagem de projetos;
- escanear novamente e remover workspace continuam no grupo de ações do
  cabeçalho, separados das ações de execução;
- o teste da Visão geral foi atualizado para cobrir a ausência dos filtros e a
  nova posição dos controles de servidor;
- a arquitetura da informação foi reconciliada com o comportamento atual.

## Limitações

A mudança não altera o comportamento das ações globais de iniciar/parar nem os
controles individuais de cada projeto; apenas simplifica a composição da
landing.

## Validação

A suíte não foi executada pelo conector do GitHub. O teste automatizado
`apps/web/test/dashboard-view.test.ts` foi atualizado para a regressão desta
entrega e deve ser validado pelo CI do pull request.

`tasks/PENDENCIAS.md` não possui item aberto específico para esses filtros ou
para a posição dos controles, portanto não houve item a remover do backlog.
