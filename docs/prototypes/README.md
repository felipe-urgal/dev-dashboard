# Protótipos de interface

Páginas HTML autocontidas, sem build step, usadas para discutir direção visual
antes de mexer nos componentes Vue de `apps/web`. Elas **não** entram no bundle
e não conversam com a API — todo dado é fixo no próprio arquivo.

Para abrir, basta apontar o navegador para o arquivo:

```bash
xdg-open docs/prototypes/git-diff-github.html
```

## `git-diff-github.html` — diff no estilo GitHub

Explora como ficaria o painel Diff (`ProjectGitDiffPage.vue`) adotando o
vocabulário visual do GitHub, mantendo os tokens de
`apps/web/src/styles/tokens.css` (funciona nos temas claro e escuro).

Diferenças em relação à tela atual:

| Hoje | No protótipo |
| --- | --- |
| Mestre/detalhe: lista à esquerda, um arquivo por vez | Todos os arquivos empilhados, com cabeçalho fixo por arquivo |
| Linha inteira pintada de verde ou vermelho | Destaque intralinha: só os trechos alterados recebem fundo forte |
| Trecho fixo devolvido pela API | Expansão de contexto pelas setas no cabeçalho `@@` |
| Sem controle de progresso | "Revisado" por arquivo, com barra de progresso na barra fixa |
| Contagem só no resumo do topo | Barra de proporção e status no cabeçalho de cada arquivo |
| — | Âncora de comentário por linha (apenas o gesto visual) |

O protótipo deriva o diff em runtime (LCS de linhas + LCS de tokens para o
destaque intralinha) a partir dos arquivos antes/depois embutidos, para que a
expansão de contexto mostre linhas reais em vez de placeholders.

### Se virar implementação

O que muda de fato no monorepo:

- `apps/web/src/utils/git-diff-view.ts` ganha o diff de palavras entre pares
  removido/adicionado; `parseUnifiedGitDiff` e `buildSplitGitDiffRows`
  continuam válidos.
- `ProjectGitDiffPage.vue` deixa de carregar um arquivo por vez: precisa buscar
  o diff de todos os arquivos do escopo (com carregamento sob demanda ao entrar
  em tela, para não estourar o limite de leitura).
- A expansão de contexto exige um endpoint novo — ler faixas de linhas de um
  arquivo versionado. Isso passa pelo checklist de
  `docs/architecture/security.md`: caminho validado contra a lista de arquivos
  do próprio diff, faixa limitada, nunca caminho arbitrário do navegador.
- "Revisado" é estado local do navegador; nada precisa ir para a API.
