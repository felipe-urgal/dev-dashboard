# Task 111 — Varredura recursiva de workspace: expor na API e na UI

## Contexto

Segue diretamente a task 110, que entregou a capacidade de varredura
recursiva só na biblioteca (`packages/project-discovery`). O item pendente
registrado em `tasks/PENDENCIAS.md` ("Descoberta e projetos complexos") era
decidir e implementar como expor essa capacidade via API e UI.

## Decisão de produto

- Opt-in **por workspace**, persistido (`Workspace.recursiveScan`), não por
  chamada de scan — o navegador nunca escolhe o modo de varredura na hora do
  scan, só liga/desliga a preferência de um workspace já cadastrado
  (mantém o catálogo fechado de ações do modelo de segurança da API).
- Definido no cadastro do workspace (checkbox no `WorkspaceManagerModal.vue`,
  com aviso de que pode deixar o scan mais lento em workspaces grandes).
- Também alterável depois via `PATCH /api/workspaces/:workspaceId`, para
  workspaces já cadastrados — hoje só pela API; não existe tela para isso na
  UI (ver "Fora de escopo" abaixo).

## Mudanças

- `packages/contracts`: `Workspace.recursiveScan: boolean` (campo obrigatório
  no contrato).
- `packages/core` (`WorkspaceRepository`):
  - `CreateWorkspaceInput.recursiveScan?: boolean` (padrão `false`);
  - `setRecursiveScan(workspaceId, recursiveScan)`, novo método;
  - leitura do config persistido migra entradas sem o campo para
    `recursiveScan: false` em vez de descartar o workspace (primeiro
    precedente de migração/backfill de campo novo em `packages/core` —
    documentado no código, não existia um padrão anterior a seguir).
- `apps/api`:
  - `workspaceResponseSchema` ganha `recursiveScan` (obrigatório);
  - `workspaceScanWarningResponseSchema.code` ganha os três warnings novos da
    task 110 (`SCAN_DEPTH_LIMIT_REACHED`, `SCAN_PROJECT_LIMIT_REACHED`,
    `SCAN_TIMEOUT`), que só passavam a poder aparecer na resposta HTTP a
    partir desta entrega;
  - `POST /workspaces` aceita `recursiveScan` opcional no corpo;
  - `PATCH /workspaces/:workspaceId` (novo), corpo `{ recursiveScan: boolean
    }`, chama `workspaceRepository.setRecursiveScan`;
  - `POST /workspaces/:workspaceId/scan` passa
    `{ recursive: workspace.recursiveScan }` para `scanWorkspace` — decisão
    sempre lida do workspace persistido, nunca do corpo da requisição.
- `apps/web`:
  - `api/workspaces.ts`: `createWorkspace` aceita `recursiveScan`;
    `updateWorkspaceRecursiveScan` novo (não usado pela UI ainda, disponível
    para quando a tela de edição existir);
  - `stores/dashboard.ts`: `newWorkspaceRecursiveScan`, enviado no
    `handleCreateWorkspace`;
  - `WorkspaceManagerModal.vue`: checkbox "Escanear subdiretórios
    (monorepos)" no formulário de cadastro.

## Fora de escopo (registrado, não perdido)

- Tela para alternar `recursiveScan` de um workspace **já cadastrado** pela
  UI — hoje só é possível recadastrar o workspace ou usar o PATCH
  diretamente. Não existe hoje nenhuma tela de edição de workspace (o
  `WorkspaceManagerModal` só cria); construir uma é maior que esta entrega e
  fica registrado em `tasks/PENDENCIAS.md`.

## Arquivos

- `packages/contracts/src/workspace.ts`
- `packages/core/src/workspace-repository.ts`,
  `packages/core/test/workspace-repository.test.ts`
- `apps/api/src/http/response-schemas/workspaces-projects.ts`,
  `apps/api/src/routes/workspaces.ts`, `apps/api/test/routes.test.ts`
- `apps/web/src/api/workspaces.ts`, `apps/web/src/stores/dashboard.ts`,
  `apps/web/src/components/WorkspaceManagerModal.vue`,
  `apps/web/test/workspace-manager-modal.test.ts`,
  `apps/web/test/dashboard-store.test.ts`,
  `apps/web/test/support/activity-fixtures.ts`
- `docs/architecture/overview.md` — seção "Varredura recursiva (opt-in)"
  atualizada.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

Cobertura nova: migração de config legado sem `recursiveScan`
(`packages/core`), `PATCH` de sucesso/404 e scan recursivo end-to-end contra
um projeto aninhado real (`apps/api`), checkbox do formulário de cadastro
(`apps/web`).

## Decisões

- `recursiveScan` obrigatório no contrato `Workspace`, mas opcional/tolerante
  na leitura do JSON persistido (migração), para não repetir o risco descrito
  na task 110 de silenciosamente descartar dados de quem já tinha um
  `config.json` sem o campo.
- Preferi persistir a opção no workspace a aceitá-la como parâmetro da
  chamada de scan — o navegador escolher o "modo" de uma operação de
  filesystem a cada clique se aproxima mais de aceitar uma opção arbitrária
  do que de um catálogo fechado; fixar a decisão no cadastro (já validado,
  já com caminho autorizado) mantém a rota de scan simples e sem superfície
  nova de entrada não seguindo o padrão de "só IDs e valores validados" do
  modelo de segurança da API.
