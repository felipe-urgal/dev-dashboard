# Task 030 — Três protótipos futuristas para a home

## Status

Concluída em 27 de julho de 2026.

## Objetivo

Reimaginar a página inicial do dashboard com três direções visuais futuristas, comparáveis dentro do próprio produto, sem remover as ações reais de workspace e projetos.

## Resultado

A home ganhou um laboratório de interface com três protótipos selecionáveis:

1. **Órbita** — uma estação panorâmica com mapa orbital, núcleo do dashboard e métricas do ecossistema;
2. **Terminal** — uma central operacional de alta densidade, tipografia monoespaçada e telemetria em grade;
3. **Aurora** — uma direção ambiental, fluida e calma, com superfícies translúcidas e resumo visual.

Os três conceitos usam os dados reais já presentes na store. O gerenciamento de workspaces, os alertas, a listagem de repositórios e seus estados de carregamento foram preservados abaixo da exploração visual. O seletor é um conjunto de abas acessível por semântica (`tablist`/`tab` e `aria-selected`) e a composição possui adaptações para telas menores.

## Arquivos alterados

- `apps/web/src/views/DashboardView.vue` — seletor e estruturas dos três protótipos, além da nova área de contexto da exploração;
- `apps/web/src/styles/components.css` — identidade visual, responsividade e composições Órbita, Terminal e Aurora;
- `apps/web/test/dashboard-view.test.ts` — cobertura da navegação entre as três propostas e regressão das funções existentes;
- `docs/tasks/030-home-futurista.md` — registro desta entrega;
- `docs/tasks/README.md` e `docs/tasks/NEXT.md` — índice e planejamento subsequente.

## Decisões

- Os protótipos convivem na mesma rota para permitir comparação imediata, sem criar rotas temporárias.
- Não foram adicionadas imagens ou dependências: os grafismos são CSS, leves e responsivos.
- A seleção começa em **Órbita** e permanece local à sessão; persistência só deverá ser adicionada depois que uma direção for escolhida.
- As métricas antigas foram mantidas no DOM como resumo sem destaque para preservar a estrutura atual enquanto os protótipos são avaliados.

## Limitações

- Esta entrega não escolhe uma direção definitiva nem aplica sua linguagem à sidebar e às páginas internas.
- A data da barra do conceito Terminal é deliberadamente parte do mockup visual, não um relógio em tempo real.
- Os protótipos apresentam dados existentes; não introduzem novos indicadores de processo ou atividade.

## Validação

- teste montado do dashboard alternando entre Órbita, Terminal e Aurora;
- typecheck de todos os workspaces;
- build de packages e aplicações;
- suíte automatizada completa;
- inspeção visual da home em navegador.
