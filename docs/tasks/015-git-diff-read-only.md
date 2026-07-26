# Task 015 — Git leitura profunda (diff por arquivo)

## Status

Concluída.

## Objetivo

Expor diff Git somente leitura (resumido e por arquivo) sem introduzir
mutação nem novo modelo de segredo, primeira etapa do Horizonte 2 do
roadmap.

## Escopo entregue

- Contratos novos em `packages/contracts/src/git.ts`: `GitDiffScope`
  (`worktree` | `index` | `combined`), `GitDiffFile` (path,
  previousPath, status, additions, deletions, binary), `GitDiffSnapshot`
  (repository, scope, files[]), `GitFileDiff` (path, scope, status,
  binary, content, truncated, masked, redactionCount).
- `GitService.getDiffSnapshot(project, scope)` combina
  `git status --porcelain=v2` com `git diff --numstat -z` para gerar a
  lista com contagem de linhas e reaproveita as classificações do
  overview.
- `GitService.getFileDiff(project, path, scope)` executa
  `git diff -- <path>`, valida path com `path.resolve`+`path.relative`
  contra o diretório do projeto (`GIT_DIFF_PATH_OUTSIDE_PROJECT`,
  `GIT_DIFF_PATH_INVALID`), trunca em 262 KiB
  (`GIT_DIFF_FILE_LIMIT`) e passa pelo `maskSensitiveLogContent`
  reutilizado do `process-manager`.
- Rotas novas: `GET /api/projects/:projectId/git/diff` (querystring
  `scope`) e `GET /api/projects/:projectId/git/diff/file` (querystring
  `path` obrigatório + `scope` opcional). Ambas com JSON schema
  explícito.
- Novos códigos de erro `GIT_NOT_REPOSITORY`,
  `GIT_DIFF_PATH_OUTSIDE_PROJECT`, `GIT_DIFF_PATH_INVALID` no union
  `ApiErrorCode`.
- Cliente `fetchProjectGitDiff` e `fetchProjectGitFileDiff` em
  `apps/web/src/api.ts` com `AbortSignal` opcional.
- `apps/web/src/components/ProjectGitPanel.vue` ganha seção
  "Diferenças por arquivo": lista clicável de arquivos com
  additions/deletions, viewer com aviso de mascaramento/truncamento e
  mensagem apropriada para diff binário.
- Estilos `git-diff-*` em `styles.css`.

## Testes

- `apps/api/test/git-service-diff.test.ts` (4 casos, repositório real
  efêmero): snapshot com additions/deletions, mascaramento e
  truncamento, path traversal proibido, diretório não-git.
- `apps/web/test/project-git-panel.test.ts` (4 casos montados):
  listagem, snapshot vazio, seleção de arquivo com mascaramento, erro
  do fetch.

## Fora do escopo

- Qualquer mutação Git — segue nas próximas tasks.
- Diff em três vias (merge conflicts).
- Blame por linha ou histórico de commit isolado.

## Verificação

```
npm run typecheck
npm run build
npm test
```

`apps/api` passa de 92 para 96 casos; `apps/web` de 25 para 29.
