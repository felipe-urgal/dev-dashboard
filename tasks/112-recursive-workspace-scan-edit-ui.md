# Task 112 — Tela para alternar recursiveScan de um workspace já cadastrado

## Contexto

Último item pendente da frente aberta pelas tasks 110/111: a opção
`recursiveScan` só podia ser definida no cadastro do workspace ou alterada
via API (`PATCH /api/workspaces/:workspaceId`) — não existia UI para mudar a
preferência de um workspace já existente, porque o `WorkspaceManagerModal`
só tinha um formulário de criação.

## Mudança

`WorkspaceManagerModal.vue` ganhou uma seção "Workspaces cadastrados" (só
aparece quando há pelo menos um workspace), listando nome, caminho e um
switch `recursiveScan` por workspace. Não é uma tela de edição genérica —
só o campo que já tinha um endpoint pronto (`PATCH`) e nenhuma forma de
alcançá-lo pela UI.

- `stores/dashboard.ts`: `toggleWorkspaceRecursiveScan(workspace)` e
  `recursiveScanUpdatingIds`, no mesmo padrão de atualização otimista +
  rollback já usado por `toggleProjectFavorite`/`favoriteUpdatingIds` —
  aplica a mudança local antes da resposta da API e desfaz se a chamada
  falhar, desabilitando o switch enquanto a chamada está em voo.
- `api/workspaces.ts::updateWorkspaceRecursiveScan` (já existia desde a task
  111, sem uso na UI até agora) passou a ser chamado pelo store.
- CSS novo (`workspace-existing-list`, `workspace-existing-row`) em
  `styles/components/project-details.css`, reaproveitando as classes
  `settings-row`/`settings-switch-control` já usadas em `SettingsView.vue`.

## Fora de escopo

- Editar outros campos do workspace (nome, caminho) — não têm endpoint hoje
  e não foram pedidos; só `recursiveScan` tinha um `PATCH` pronto e sem UI.
- Uma tela de "editar workspace" genérica e dedicada — o switch inline na
  lista resolve o caso concreto sem introduzir uma rota/tela nova.

## Arquivos

- `apps/web/src/stores/dashboard.ts`
- `apps/web/src/components/WorkspaceManagerModal.vue`
- `apps/web/src/styles/components/project-details.css`
- `apps/web/test/dashboard-store.test.ts`,
  `apps/web/test/workspace-manager-modal.test.ts`
- `docs/architecture/overview.md`

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

Cobertura nova: alternância otimista de `recursiveScan` com sucesso e com
rollback em falha (`dashboard-store.test.ts`), lista de workspaces
cadastrados oculta quando vazia e switch por workspace disparando
`toggleWorkspaceRecursiveScan` (`workspace-manager-modal.test.ts`).

## Decisões

- Reaproveitar o `WorkspaceManagerModal` existente em vez de criar uma tela
  nova: é o único ponto de entrada de "gestão de workspaces" que já existe
  na UI, e a lista de cadastrados é pequena o bastante para caber no mesmo
  modal sem virar uma tela própria.
