# Task 137 — Visão geral em componente único

## Status

Concluída.

## Objetivo

Simplificar a página **Visão geral** removendo o bloco isolado de workspace carregado e concentrando as ações relacionadas ao workspace no mesmo card de **Projetos detectados**.

## Decisões

- Foi escolhido o terceiro protótipo avaliado com o usuário.
- O caminho do workspace não é repetido no cabeçalho do card, pois os caminhos já aparecem em cada projeto da listagem e o workspace ativo já fica identificado na barra lateral.
- **Escanear novamente** e **Remover** ficam no canto superior direito do cabeçalho de **Projetos detectados**.
- Abaixo deles permanecem a contagem de projetos e as ações em lote de servidores.
- O bloco azul independente `Workspace carregado: ...` deixa de existir.
- O comportamento das ações não muda; a alteração é apenas de organização visual.

## Arquivos

- `apps/web/src/views/DashboardView.vue`

## Resultado

A Visão geral passa a ter um único componente principal para o workspace selecionado: o card de repositórios contém título, ações do workspace, ações em lote, busca, filtros e a listagem de projetos.

## Validação

A validação automatizada fica a cargo do CI do pull request:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm test
npm run test:e2e
```
