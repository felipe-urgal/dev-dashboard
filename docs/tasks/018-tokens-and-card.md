# Task 018 — Esqueleto de tokens + componente `<Card>`

## Status

Concluída.

## Objetivo

Iniciar a implementação da reforma decidida na task 017: introduzir o
esqueleto de camadas CSS + tokens e o primeiro componente
compartilhado (`<Card>`), migrando o `ProjectCard` como prova de
conceito. Passos 1 e 2 do roteiro em `docs/design/redesign-2026.md`.

## Escopo entregue

- `apps/web/src/styles/tokens.css` com as variáveis definidas no
  redesign, cobrindo tema escuro (default) e claro (via
  `[data-theme='light']`). Superfícies, bordas, texto, accents,
  pares status (`success/warning/danger/info` em `-surface`/`-text`),
  família tipográfica, escala tipográfica (`xs`..`xl`), pesos, escala
  de espaço 4 px, raios e sombras.
- `apps/web/src/styles/index.css` com `@import` de `tokens.css`.
  Nova entrada no `main.ts`, importada **antes** do `styles.css`
  legado, de forma que os tokens ficam disponíveis para os
  componentes migrados sem interferir no CSS existente.
- `apps/web/src/components/Card.vue`: componente com `tag`
  customizável (default `section`), `padded` (default true) e
  `interactive` (default false); slots `default`, `header` e
  `actions`; estilos scoped usando os tokens (surface, border,
  radius, padding, hover). Header não renderiza se nenhum dos dois
  slots (`header`/`actions`) for fornecido.
- `apps/web/src/components/ProjectCard.vue` migrado para renderizar
  `<Card tag="article" :padded="false" interactive>` como container
  externo. Layout interno preservado; a única mudança visual
  esperada é a perda do gradiente decorativo do card, alinhada ao
  princípio "informação acima de decoração".
- `apps/web/test/card.test.ts` com três casos montados: slot default
  com padding padrão e sem header vazio; header + actions renderizam
  quando os slots são fornecidos; `tag`, `interactive` e `padded`
  respeitados.

## Fora do escopo

- `<StatusBadge>` e migração dos demais painéis (tasks 019+).
- Introduzir `data-density` / `data-theme` na sidebar.
- Remover CSS legado — só é removido quando todas as instâncias
  antigas do padrão migrarem.

## Verificação

```
npm run typecheck
npm run build
npm test
```

Suíte `apps/web` cresce de 32 para 35 casos (3 novos em
`card.test.ts`).
