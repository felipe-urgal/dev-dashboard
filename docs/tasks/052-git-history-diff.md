# Task 052 — Histórico com diff por arquivo e layout novo

## Status

Implementação concluída. `typecheck`, `build`, `test` e o smoke Playwright
aprovados; verificação visual com a API real (servidor de fixtures do E2E sobre
um repositório Git temporário), nos modos unificado e lado a lado.

## Objetivo

Levar ao **Histórico** a mesma leitura de diff entregue na aba Diff (task 050) e
adotar o layout de tabela + modal aprovado, substituindo os enhancers de DOM que
montavam a tela por fora do Vue.

## Resultado

### Interface (`ProjectGitHistoryPage.vue`)

- o histórico deixou de ser construído por enhancers e passou a ser um
  componente Vue montado direto pelo `ProjectGitPanel`;
- **tabela** com colunas Data, Commit, Autor e Tempo, agrupada por dia, com
  contagem de commits no cabeçalho de cada grupo e paginação com faixa
  ("Mostrando 1 a 20 de 32 commits");
- clicar em uma linha abre o **modal do commit**: hash com copiar, assunto,
  autor, data, corpo da mensagem e "Arquivos alterados (N)";
- cada arquivo abre seu próprio diff, carregado sob demanda; com um único
  arquivo, o diff já vem aberto;
- o diff usa a mesma renderização da aba Diff — **destaque intralinha**,
  **realce de sintaxe com detecção de linguagem** e alternância entre
  **unificado** e **lado a lado** (preferência persistida), além da legenda
  Adicionado / Removido / Contexto;
- filtros preservados do enhancer antigo: referência agrupada por remoto, busca,
  autor, tipo (todos/sem merges/somente merges) e o escopo
  **commits exclusivos da branch** (padrão anterior) ou todos da referência.

### API

- nova rota `GET /projects/:projectId/git/commits/:commitHash/file?path=…`,
  devolvendo o diff de um único arquivo do commit;
- `pageSize` do histórico (commits e commits exclusivos) passou de no máximo 10
  para 50, para caber a página de 20 do layout novo;
- contratos novos em `packages/contracts`: `GitCommitDetails`,
  `GitCommitDetailFile`, `GitCommitFileDiff`, `GitCommitHistoryEntry`,
  `GitCommitHistoryPage`, `GitCommitHistoryKind` e `GitCommitFileStatus` — antes
  esses tipos viviam duplicados dentro do enhancer.

### Correção de bug

`parseNumstat` do serviço de commits não tratava o formato `-z` de renomeações
(três registros: contagens, caminho anterior, caminho novo). O resultado era que
**arquivos renomeados sumiam da lista de arquivos do commit**. O parser passou a
consumir os três registros, como o equivalente em `git-service.ts` já fazia.

### Remoções

Saíram os enhancers que montavam o histórico por fora do Vue e seus estilos:
`git-history-page-enhancer`, `git-history/*`, `git-history-global-search-fix*`,
`git-history-inline-diff-fix*`, `git-history-pagination.css` e
`git-history-compact-columns.css`. O `git-inline-file-diff` continua, sem a
configuração do histórico — ele ainda serve o resumo do painel Git e o stash.

## Segurança

A rota nova segue o checklist de `docs/architecture/security.md`:

- o hash é validado por padrão hexadecimal no schema e conferido com
  `rev-parse --verify` antes de qualquer leitura;
- o caminho vem do navegador mas só é aceito se constar da lista de arquivos do
  próprio commit, senão a resposta é `GIT_COMMIT_FILE_NOT_FOUND`;
- renomeações usam o caminho anterior derivado do próprio Git, nunca do cliente;
- a leitura é limitada a 262144 bytes e passa pelo mesmo mascaramento de
  segredos do diff e dos logs, informando `masked`/`redactionCount`;
- o schema de resposta limita a serialização às propriedades do contrato.

## Arquivos principais

- `apps/web/src/components/ProjectGitHistoryPage.vue`
- `apps/web/src/components/ProjectGitHistoryPage.css`
- `apps/web/src/components/ProjectGitHistoryModal.css`
- `apps/web/src/components/GitFileDiffView.vue`
- `apps/web/src/components/ProjectGitPanel.vue`
- `apps/web/src/api/git.ts`
- `apps/api/src/services/git-commit-details-service.ts`
- `apps/api/src/routes/git-commit-details.ts`
- `apps/api/src/routes/git-exclusive-branch-history.ts`
- `packages/contracts/src/git.ts`

## Testes

- `apps/api/test/git-commit-details-service.test.ts` — diff de um arquivo,
  caminho anterior de renomeado, recusa de arquivo fora do commit, mascaramento
  e a regressão dos renomeados na lista de arquivos;
- `apps/web/test/project-git-history-page.test.ts` — tabela agrupada por dia,
  consulta aos commits exclusivos, modal com arquivos, carga do diff com
  destaque intralinha, alternância unificado/lado a lado, fechamento e
  paginação.

## Limitações

- não há expansão de contexto (`@@`) no histórico: exigiria ler faixas de linhas
  na revisão do commit (`git show <hash>:<caminho>`), o que fica para uma
  entrega própria;
- `GitFileDiffView.vue` compartilha a renderização com a aba Diff por
  duplicação de template — a aba Diff mantém sua própria cópia porque nela as
  linhas convivem com os controles de expansão;
- o modal não navega entre commits (Prev/Next) nem entre arquivos pelo teclado.
