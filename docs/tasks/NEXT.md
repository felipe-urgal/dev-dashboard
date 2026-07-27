# Próxima atividade — 018: Esqueleto de tokens + componente `<Card>` compartilhado

## Contexto

A task 017 registrou as decisões da reforma de design em
`docs/design/redesign-2026.md`. Esta task começa a implementá-las por
duas peças isoladas e mensuráveis — introduzir o esqueleto de camadas
CSS com tokens, e extrair o primeiro componente compartilhado
(`<Card>`) — sem regressão visual.

## Objetivo

Preparar o terreno da reforma: divisão de `styles.css` em camadas,
arquivo de tokens com as variáveis definidas no redesign, e um
componente `<Card>` reutilizável migrando o painel de projeto mais
simples (Dashboard `ProjectCard`) como prova de conceito. Nenhuma
outra tela muda visualmente.

## Plano detalhado

1. Criar `apps/web/src/styles/` com `tokens.css`, `reset.css`,
   `base.css`, `layout.css`, `components.css`, `utilities.css` e um
   `index.css` que faz o `@import` de todos. Atualizar `main.ts` para
   importar `styles/index.css` **antes** de `styles.css` legado.
2. Popular `tokens.css` com as variáveis do redesign, cobrindo tema
   escuro (default) e claro (via `[data-theme='light']`). Não usar
   ainda em componentes.
3. Criar `apps/web/src/components/Card.vue` com slots `default`,
   `header`, `actions`, seguindo o padrão descrito em
   `redesign-2026.md#padrões-de-componente`.
4. Migrar `ProjectCard` (apenas o container externo — o conteúdo
   interno segue igual) para usar `<Card>`.
5. Migrar o teste montado existente (se houver) e adicionar um novo
   caso mínimo para o `<Card>` cobrindo os três slots.
6. Comparar `DashboardView` antes/depois em ambiente rodando; nenhuma
   diferença visual esperada.
7. Atualizar `redesign-2026.md` marcando passo 1 e 2 do roteiro como
   concluídos.

## Fora do escopo

- Migrar `<StatusBadge>` e demais painéis (fica para tasks 019+).
- Introduzir `data-density` / `data-theme` na sidebar (fica para
  depois da migração dos componentes principais).
- Remover CSS legado — só é removido quando **todas** as instâncias
  antigas do padrão migrarem.

## Critérios de aceite

- `apps/web/src/styles/` existe com o esqueleto documentado e
  `tokens.css` populado;
- `Card.vue` existe e é usado por `ProjectCard` sem regressão visual
  perceptível no `DashboardView`;
- suíte `apps/web` mantém-se verde (testes montados existentes
  passam);
- `npm run typecheck`, `npm run build` e `npm test` verdes.
