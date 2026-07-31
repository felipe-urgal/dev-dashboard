# Task 050 — Diff no estilo GitHub

## Status

Implementação concluída. `typecheck`, `build`, `test` e o smoke Playwright
aprovados; verificação visual feita com a API real (servidor de fixtures do E2E
sobre um repositório Git temporário), nos modos unificado e lado a lado.

## Objetivo

Aproximar a aba **Diff** da leitura que já é familiar no GitHub, tanto na
apresentação quanto na navegação da revisão, sem perder os limites de segurança
da API local.

## Resultado

### Interface (`ProjectGitDiffPage.vue`)

- a tela deixou de ser mestre/detalhe: todos os arquivos aparecem empilhados,
  cada um em seu cartão, com o cabeçalho fixo no topo enquanto o arquivo está
  em tela;
- cada cartão traz caminho (diretório esmaecido + nome em destaque), status,
  contagem `+/−`, barra de proporção de cinco blocos, copiar caminho, recolher
  e a marcação **Revisado** — que recolhe o arquivo e alimenta a barra de
  progresso da barra de ferramentas;
- o diff de cada arquivo é carregado sob demanda, quando o cartão se aproxima
  da viewport (`IntersectionObserver`, margem de 600px), com no máximo três
  requisições simultâneas;
- **destaque intralinha**: em pares removido/adicionado, só os trechos
  realmente alterados recebem fundo forte;
- **expansão de contexto**: as setas no cabeçalho `@@` trazem 20 linhas acima
  ou abaixo do trecho, numeradas nos dois lados;
- a busca por conteúdo passou a valer para todos os arquivos carregados, e o
  modo unificado/lado a lado é preferência persistida;
- o seletor de escopo (Todas/Staged/Não staged) e a lista lateral de arquivos
  foram removidos — o escopo é sempre `combined`, como no `git diff HEAD`.

### API

- nova rota `GET /projects/:projectId/git/diff/file/lines`, servindo faixas de
  linhas do lado "novo" do arquivo para a expansão de contexto;
- `GitService.getFileLines` lê o blob do índice (`git show :caminho`) quando o
  escopo é `index` e a árvore de trabalho nos demais;
- novo contrato `GitFileLines` e novos códigos de erro
  `GIT_DIFF_PATH_NOT_IN_DIFF`, `GIT_DIFF_RANGE_INVALID` e
  `GIT_DIFF_LINES_UNAVAILABLE`.

## Segurança

A rota nova segue o checklist de `docs/architecture/security.md`:

- o navegador nunca envia um caminho livre: além da checagem de contenção no
  projeto (`ensurePathInsideProject`), o caminho precisa constar da lista de
  arquivos do diff daquele escopo, senão a resposta é
  `GIT_DIFF_PATH_NOT_IN_DIFF`;
- a faixa é validada no schema (inteiros ≥ 1) e no serviço, com teto de 400
  linhas por requisição;
- a leitura da árvore de trabalho é limitada aos mesmos 262144 bytes das demais
  leituras e recusa o que não for arquivo comum;
- o trecho lido passa pelo mesmo mascaramento de segredos do diff e dos logs,
  informando `masked`/`redactionCount`;
- arquivos binários e removidos não têm expansão (`GIT_DIFF_LINES_UNAVAILABLE`);
- o schema de resposta limita a serialização às propriedades do contrato.

## Arquivos principais

- `apps/web/src/components/ProjectGitDiffPage.vue`
- `apps/web/src/components/ProjectGitDiffPage.css`
- `apps/web/src/utils/git-diff-view.ts`
- `apps/web/src/api/git.ts`
- `apps/web/src/git-action-feedback.ts`
- `apps/web/src/git-diff-compact/filters.ts`
- `apps/api/src/routes/projects.ts`
- `apps/api/src/services/git-service.ts`
- `apps/api/src/http/response-schemas/git.ts`
- `apps/api/src/http/api-error.ts`
- `packages/contracts/src/git.ts`

## Testes

- `apps/api/test/git-service-diff.test.ts` — faixa pedida, recorte no fim do
  arquivo, blob do índice, mascaramento, caminho fora do projeto, arquivo fora
  do diff, faixa inválida e arquivo removido;
- `apps/web/test/git-diff-view.test.ts` — diff de palavras, anotação dos pares,
  render combinando destaque e busca, escape de HTML, agrupamento em hunks e
  numeração do contexto expandido;
- `apps/web/test/project-git-diff-page.test.ts` — cartões empilhados, carga de
  todos os arquivos, destaque intralinha, expansão de contexto, marcação de
  revisado e filtro por busca.

## Limitações

- arquivos não rastreados continuam fora do diff (comportamento do
  `git diff`, anterior a esta entrega);
- a expansão de contexto não tem passo "mostrar o arquivo inteiro";
- a âncora de comentário por linha do protótipo não foi implementada: exigiria
  persistência de comentários, que o dashboard não possui;
- o protótipo em `docs/prototypes/git-diff-github.html` permanece no repositório
  como referência visual e não compartilha código com a implementação;
- ao abrir a aba Diff, o `git-diff-page-enhancer` monta um segundo app Vue
  dentro da seção legada e o console registra um `insertBefore` nulo. O erro é
  anterior a esta entrega (reproduzido em `main`) e não afeta a tela; a remoção
  desse enhancer merece entrega própria.
