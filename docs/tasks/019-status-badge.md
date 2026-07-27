# Task 019 — `<StatusBadge>` compartilhado

## Status

Concluída.

## Objetivo

Passo 3 do roteiro em `docs/design/redesign-2026.md`: unificar as
badges de status espalhadas por vertical em um único componente
`<StatusBadge>` alimentado pelos tokens de status.

## Escopo entregue

- `apps/web/src/components/StatusBadge.vue` com props `tone`
  (`success` | `warning` | `danger` | `info` | `neutral`) e `size`
  (`sm` default, `md`). Estilos scoped usando os tokens
  `--<tone>-surface` / `--<tone>-text`.
- `apps/web/src/components/status-badge-types.ts` com os tipos
  `StatusBadgeTone` / `StatusBadgeSize` para consumo por outros
  arquivos `.ts` sem depender da shim de `.vue`.
- `apps/web/src/utils/status-tones.ts` com cinco mapeadores por
  domínio: `activityToneFor`, `processToneFor`, `gitFileToneFor`,
  `riskToneFor`, `dbReachabilityToneFor`.
- Substituição de callsites:
  - `ActivityView` — chip de status usa `<StatusBadge>`.
  - `ProcessesView` — chip de status usa `<StatusBadge>`.
  - `ProjectGitPanel` — dois callsites (working tree e diff files)
    migrados; badges de mutação de branch mantidas por enquanto (não
    faziam parte do inventário de classes).
  - `ProjectScriptsPanel` — chip de risco.
  - `ProjectDatabasePanel` — chip de reachability.
- CSS legado removido do `styles.css`: `.git-status-badge`,
  `.git-status-*`, `.database-status`, `.database-status-*`,
  `.script-risk`, `.script-risk-*`, `.activity-status`,
  `.activity-status-*`.
- Utilitários obsoletos removidos: `statusToneClass`
  (`activity-format.ts`) e `processStatusToneClass`
  (`process-format.ts`).
- Testes atualizados: `activity.test.ts` e `process-format.test.ts`
  passam a validar `activityToneFor`/`processToneFor` em vez das
  antigas classes; `processes-view.test.ts` consulta
  `.dd-status-badge`; novo `status-badge.test.ts` cobre slot, tone,
  size, `data-tone` e itera pelos cinco tones.

## Fora do escopo

- Migrar painéis internos para `<Card>` (task 020+).
- Padrões de formulário, mensagens (empty/loading/erro) — passos
  posteriores.
- Introduzir toggle de tema/densidade.

## Verificação

```
npm run typecheck
npm run build
npm test
```

Suíte `apps/web` passa de 35 para 37 casos (2 novos em
`status-badge.test.ts`); demais suítes intactas.
