# Próxima atividade — 019: `<StatusBadge>` compartilhado

## Contexto

A task 018 estabeleceu o esqueleto de tokens e o primeiro componente
compartilhado (`<Card>`). Próximo passo da reforma (passo 3 do
roteiro em `docs/design/redesign-2026.md`): unificar as badges
espalhadas por vertical (`activity-status-*`, `git-status-*`,
`script-risk-*`, `database-status-*`) em um único
`<StatusBadge tone="…" />` usando os pares
`--<status>-surface` / `--<status>-text` do `tokens.css`.

## Objetivo

Introduzir um componente `<StatusBadge>` com um contrato único de
`tone` e usá-lo em `ActivityView`, `ProcessesView`, `ProjectGitPanel`
(status de arquivo e status de mutação), `ProjectScriptsPanel` (risk
badge) e `ProjectDatabasePanel` (reachability badge). Nenhuma
mudança de layout — só o vocabulário visual das badges converge para
os tokens.

## Plano detalhado

1. Criar `apps/web/src/components/StatusBadge.vue` com prop
   `tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'`,
   opcional `size: 'sm' | 'md'` (default `sm`, para chips), slot
   default para o texto. Estilos scoped usando
   `var(--<tone>-surface)` e `var(--<tone>-text)`.
2. Adicionar helpers de mapeamento por domínio em
   `apps/web/src/utils/status-tones.ts` (ex.:
   `activityToneFor(status)`, `processToneFor(status)`,
   `gitFileToneFor(status)`, `riskToneFor(risk)`,
   `dbReachabilityToneFor(state)`), retornando o `tone` genérico.
3. Substituir `<span class="activity-status activity-status-…">`
   pelas invocações de `<StatusBadge :tone="…">` em cada view/panel
   listado acima.
4. Remover as classes `activity-status-*`, `git-status-*`,
   `script-risk-*`, `database-status-*` do `styles.css` legado.
5. Testes montados atualizados para checar `.dd-status-badge` com o
   `tone` esperado em vez das classes antigas.
6. Atualizar `redesign-2026.md` marcando o passo 3 como concluído.

## Fora do escopo

- Migrar cards internos dos painéis para `<Card>` (task 020+).
- Trocar padrões de formulário / mensagens (mais adiante).
- Componente de ícone dedicado (segue sendo emoji unicode em fonte).

## Critérios de aceite

- `StatusBadge` existe e é usado por todas as telas listadas;
- nenhuma classe `activity-status-*`, `git-status-*`,
  `script-risk-*`, `database-status-*` sobrevive em `styles.css`;
- suíte `apps/web` mantém-se verde (testes atuais adaptados);
- `npm run typecheck`, `npm run build` e `npm test` verdes.
