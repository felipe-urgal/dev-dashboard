# Task 017 — Revisão de design (etapa 1 da reforma)

## Status

Concluída.

## Objetivo

Auditar o produto web e registrar decisões de vocabulário visual antes
da reforma de CSS. Nenhum código alterado.

## Escopo entregue

- Inspeção de `apps/web/src/styles.css` (1719 linhas), 8 views/painéis
  Vue e do `docs/design/information-architecture.md`.
- Constatações principais: >40 tons de cinza distintos, 113
  declarações `font-size`, badges/status implementados como classes
  ad hoc por vertical (`activity-status-*`, `git-status-*`,
  `script-risk-*`, `database-status-*`), cards com paddings
  ligeiramente diferentes por painel.
- Documento novo: `docs/design/redesign-2026.md` cobrindo princípios,
  tokens (cor, tipografia, espaço, raio, sombra), padrões de
  componente (app shell, card, lista, badge, formulário, mensagens,
  empty/loading/erro), densidade e tema (`data-density`, `data-theme`),
  arquivo `styles.css` dividido em camadas
  (`tokens/reset/base/layout/components/utilities`), impacto nos
  contratos dos componentes, decisão de manter **CSS puro com
  variáveis** (sem Tailwind/UnoCSS agora), roteiro em 7 passos da
  reforma incremental, critério de saída da etapa 2 e itens
  explicitamente fora do escopo.
- `docs/design/information-architecture.md` recebe nota apontando o
  novo documento: o IA descreve **estrutura da informação e
  navegação**; o `redesign-2026.md` **substitui a camada visual**.

## Fora do escopo

- Escrever CSS ou tocar em componentes — vai na task 018.
- Redesign de marca / logo / ilustrações.
- Adotar biblioteca de UI externa.

## Verificação

Task só de docs. `git diff --stat` cobre a mudança; nada a testar.

## Sequência posterior

Task 018: introduzir o esqueleto de camadas
(`apps/web/src/styles/tokens.css` + imports) e migrar o primeiro
componente compartilhado (`<Card>`), sem regressão visual. Restante do
roteiro descrito no `redesign-2026.md`.
