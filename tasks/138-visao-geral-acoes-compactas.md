# Task 138 — Ações compactas na Visão geral

## Status

Concluída.

## Objetivo

Reduzir o peso visual do cabeçalho de **Projetos detectados**, substituindo a concentração de botões com texto por uma barra compacta de ações baseada em ícones.

## Decisões

- Foi escolhido o protótipo 3 avaliado com o usuário.
- A contagem de projetos passa a ficar ao lado do título **Projetos detectados**.
- **Escanear novamente**, **Remover workspace**, **Iniciar servidores** e **Parar servidores** passam a ser ações somente com ícones, mantendo `title` e `aria-label` para contexto e acessibilidade.
- As ações de workspace e de servidores ficam separadas visualmente por divisores discretos.
- O filtro de tecnologia deixa de ocupar uma linha inteira com `Todos / Rails / Node` e passa para um botão de funil que abre um menu compacto.
- O filtro ativo continua visível por estado destacado no ícone e por marcação dentro do menu.
- A busca permanece isolada abaixo do cabeçalho para preservar uma ação principal clara no lado esquerdo.
- Nenhuma regra de scan, remoção, start/stop ou filtragem foi alterada; a mudança é apenas de apresentação e interação dos controles existentes.

## Arquivos

- `apps/web/src/views/DashboardView.vue`

## Resultado

O card de repositórios fica visualmente mais leve: título e contagem formam um único grupo à esquerda, enquanto as ações globais ficam compactadas à direita em ícones com tooltips e o filtro vira um menu sob demanda.

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
