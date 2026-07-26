# Próxima atividade — 015: Git leitura profunda (diff por arquivo)

## Contexto

Com o painel de atividade (012), a base de testes de UI (013) e a
página global de processos (014) entregues, o Horizonte 1 do roadmap
está fechado. O Horizonte 2 começa por Git, e a primeira etapa é diff
por arquivo (somente leitura, sem mutação).

## Objetivo

Expor `GET /api/projects/:projectId/git/diff` retornando o diff
resumido do repositório e o diff textual por arquivo, respeitando os
mesmos limites de tamanho e mascaramento já aplicados a logs. Consumir
em uma aba nova (ou expandir a aba Git existente) mostrando lista de
arquivos alterados e visualização do diff selecionado. Nenhuma
mutação nesta entrega.

## Plano detalhado

1. Estender `GitService` em `apps/api/src/services/git-service.ts` com
   um método `diff(project)` que roda `git diff --numstat` +
   `git diff -- <path>` por arquivo sob demanda, com limite máximo por
   arquivo (mesmo `LOG_LIMIT` já usado em execução de scripts).
2. Novo contrato em `packages/contracts/src/git.ts`: `GitDiffFile` (path,
   status, additions, deletions), `GitDiffSnapshot` (files[],
   truncated), `GitFileDiff` (path, content, truncated, masked).
3. Rota `GET /api/projects/:projectId/git/diff` (lista) e
   `GET /api/projects/:projectId/git/diff/file?path=` (conteúdo por
   arquivo com path validado dentro do projeto).
4. Cliente em `apps/web/src/api.ts` com `AbortSignal`.
5. Painel Git da view do projeto ganha lista de arquivos com contagem
   de linhas e área que carrega o diff sob demanda ao selecionar.
6. Aplicar o mesmo mascaramento já usado por logs se detectar padrão
   de segredo no diff.
7. Testes: contrato, `git-service` (repositório efêmero), rota com
   path traversal proibido, teste montado do painel para os estados
   vazio/carregando/erro/sucesso.
8. Atualizar README e roadmap marcando "diff por arquivo e diff
   resumido".

## Fora do escopo

- Qualquer mutação Git (commit, stash, branch, pull/push) — fica para
  entregas posteriores.
- Diff em três vias (merge conflicts).
- Blame / histórico por linha.

## Critérios de aceite

- endpoint recusa `path` que escape do diretório do projeto;
- diff maior que o limite é truncado com sinalização explícita;
- painel Git mostra a lista de arquivos e o diff selecionado sem
  fazer pooling contínuo;
- testes de contrato, serviço, rota e componente passam;
- `npm run typecheck`, `npm run build` e `npm test` passam.
