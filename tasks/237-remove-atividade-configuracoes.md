# Task 237 — Remove Atividade e Configurações da navegação principal

**Status:** concluída em 2026-08-12.

## Objetivo

Remover as páginas globais **Atividade** (`/activity`) e **Configurações**
(`/settings`) da navegação principal, a pedido do usuário, mantendo apenas
**Visão geral** e **Processos**. As duas páginas existiam desde antes deste
projeto de limpeza e não tinham uso ativo que justificasse uma área própria.

## Resultado

- removidos os itens de navegação **Atividade** e **Configurações** da
  sidebar (`App.vue`) e as respectivas entradas da command palette
  (`useCommandPaletteItems.ts`);
- removidas as rotas `/activity` e `/settings` (`router/index.ts`) e as views
  `ActivityView.vue` e `SettingsView.vue`;
- removido o backend exclusivo da página de Atividade: `ActivityService`,
  rota `GET /api/activities` e os tipos `Activity*` de
  `packages/contracts`; nada mais consumia esse serviço (ele só agregava
  dados de `ProjectStore`/`ProcessManager`/`ScriptExecutionService`, não
  alimentava nenhum outro fluxo);
- removidas as rotas `GET`/`PUT /api/settings/retention` e o schema de
  resposta associado. A rota `/api/settings/environment-profiles` (perfis de
  ambiente reutilizáveis, usados por `ProjectEnvironmentPanel`) foi mantida —
  ela compartilhava o arquivo de rotas com a retenção, mas é uma
  funcionalidade independente e ainda ativa;
- **`RetentionSettingsRepository` (`packages/core`) foi mantido.** Ele não é
  só uma dependência da página removida: seu construtor aplica os valores de
  retenção (persistidos em `~/.config/dev-dashboard/retention-settings.json`
  ou vindos de `DEV_DASHBOARD_LOG_RETENTION_DAYS` /
  `DEV_DASHBOARD_SCRIPT_HISTORY_LIMIT` / `DEV_DASHBOARD_TEST_HISTORY_LIMIT`)
  em `process.env`, que é o que `log-retention.ts`, `script-execution-service.ts`
  e `test-execution-history-service.ts` realmente leem. Sem a página de
  Configurações, esses valores deixam de ser editáveis pela UI, mas
  continuam configuráveis por variável de ambiente ou editando o arquivo
  JSON diretamente (ver `docs/operations-and-troubleshooting.md`);
  removê-lo teria quebrado a limpeza de retenção real, não só a tela;
- ajustado o Project Doctor: três verificações (`project-directory`,
  `project-manifest`, `environment-variables`) tinham uma ação "Abrir
  configurações" apontando para a rota `/settings` removida. As duas
  primeiras (raiz do workspace incorreta) perderam a ação — a recomendação
  textual continua, mas não há mais uma página própria para onde levar o
  usuário. A terceira (variáveis de `.env` faltando) passou a apontar para a
  aba **Variáveis de ambiente** do próprio projeto (`project-environment`),
  que é o destino correto para esse caso. `ProjectDiagnosticActionTarget`
  trocou `'settings'` por `'environment'` em `packages/contracts`,
  `apps/api` (schema de resposta e checks) e `apps/web`
  (`ProjectDoctorPanel.vue`);
- removido o botão "Abrir atividade" do rodapé do `NoticeCenter` (apontava
  para `/activity`);
- removido código morto associado: `useProjectServerActivities.ts`
  (composable sem nenhum consumidor, dependia da API de atividades
  removida), `utils/activity-format.ts`, `activityToneFor` em
  `utils/status-tones.ts`, `api/activities.ts`;
- testes atualizados/removidos de acordo (`apps/web/test`,
  `apps/api/test`), incluindo o guard de acessibilidade global e os testes
  de e2e de navegação;
- documentação atualizada: `README.md` (lista de capacidades),
  `docs/design/information-architecture.md` (status da navegação e da seção
  "Configurações"), `docs/architecture/overview.md` (lista de componentes
  incorporados), `docs/architecture/api-reference.md` (regenerado via
  `npm run docs:api`).

## Validação

A validação completa fica a cargo do CI do pull request
(`typecheck`, `lint`, `build`, `docs:api:check`, `test`).

`tasks/PENDENCIAS.md` não possuía item aberto específico para esta remoção,
portanto não houve item a remover do backlog.
