# Task 053 — Painel de logs do servidor: inspetor dividido, mais recente no topo

## Status

Implementação concluída. `typecheck`, `build` e `test` (`apps/web`) aprovados
localmente, incluindo teste de montagem novo do `ProjectLogsPanel.vue` com
`@vue/test-utils`. Sem verificação em navegador real (sem projeto Rails
disponível neste ambiente para gerar um processo/log de verdade) — a
verificação foi feita via testes de montagem com log sintético.

## Objetivo

O painel de logs (`ProjectLogsPanel.vue`, aba "Requisições") tinha três
problemas levantados pelo usuário a partir de um print real:

1. visual pouco profissional/difícil de escanear — todo card de requisição
   tinha o mesmo peso visual, timestamp completo repetido em cada linha, SQL e
   parâmetros sem realce;
2. log mais antigo no topo, indo contra o hábito de "o que aconteceu agora" ao
   abrir a tela;
3. **bug real**: o primeiro log grande (log de boot com milhares de linhas)
   travava a aba, exigindo fechar e abrir outra.

Três direções de redesenho foram desenhadas como protótipo (artifact HTML) e
avaliadas com o usuário; a escolhida foi a "C — inspetor dividido" (lista de
triagem à esquerda, dossiê completo da requisição selecionada à direita), por
ser mais adequada a debugar um erro específico.

## Resultado

### Interface (`ProjectLogsPanel.vue`)

- a visão "Requisições" deixou de ser uma lista vertical de cards e virou um
  **inspetor de duas colunas**: `.rails-inspector-list` (linhas compactas:
  método, status, rota, duração, hora) e `.rails-inspector-detail` (dossiê da
  requisição selecionada: stats em grade, callout de N+1, erro, SQL agrupado,
  renderização, parâmetros, outras linhas). Grupos "sistema" (chatter de boot
  sem prefixo de request) aparecem na mesma lista e mostram suas linhas cruas
  no dossiê;
- seleção é por `requestId` (estável entre polls), não pelo índice interno do
  grupo — que muda a cada parse porque a API só devolve o trecho final do
  arquivo. Um `watch` reseleciona a primeira linha visível quando a seleção
  atual some da lista (filtro mudou, ou saiu da janela renderizada);
- **SQL agrupado por padrão normalizado** (`groupSqlLines`, literais viram
  `?`), com contagem, tempo médio e total por padrão, syntax highlight
  (`highlightSqlHtml` — keywords, identificadores entre crases, strings,
  números) e um selo "N+1 provável" quando o mesmo padrão roda ≥3 vezes na
  mesma requisição, com callout dedicado no topo do dossiê;
- **parâmetros em árvore navegável** (`RailsParamsTree.vue`), com parser
  próprio do formato `params.inspect` do Rails (`ruby-inspect-parser.ts`) —
  hash-rocket (`"a"=>"b"`), aninhamento, arrays, tipos (string/número/
  booleano/nulo) e o wrapper `#<ActionController::Parameters ... permitted:
  ...>`. Campos filtrados (`[FILTERED]`) viram um chip "mascarado" em vez de
  aparecer como texto solto. Falha de parse cai para o texto bruto em `<pre>`;
- **"Entender esta consulta"**: cada padrão de SQL agrupado ganhou um
  `<details>` com a explicação em português (descrição, retorno esperado,
  tabelas envolvidas), reaproveitando `explainSql` do módulo
  `sql-explanation/` que já existia — antes só rodava via um enhancer de DOM
  que ficou órfão com a remoção dos cards antigos (ver "Remoções");
- **mais recente no topo** nas duas visões: os grupos do parser (que saem em
  ordem cronológica) são invertidos (`orderedGroups`) antes de filtrar/exibir;
  o "Raw limpo" também passou a montar sua lista de linhas a partir dos grupos
  invertidos (em vez do array cronológico plano), o que mantém uma requisição
  inteira coesa (todas as suas linhas juntas, na ordem correta) mesmo lendo de
  trás para frente;
- `followLogs`/"auto scroll" passou a ancorar no **topo** (`scrollTop = 0`) em
  vez do fundo — `useProjectLogsPolling` foi ajustado (`scrollLogsToLatest`,
  antes `scrollLogsToBottom`; `handleLogScroll` agora mede distância do topo).
  O botão do rodapé virou "Ir para o mais recente".

### Bug do travamento (log grande)

A causa não era o regex de limpeza de ANSI (testado isoladamente com payloads
adversariais — sem sinal de backtracking catastrófico). O problema real: tanto
a lista de requisições quanto o "Raw limpo" renderizavam **todo** o conteúdo
do log de uma vez — inclusive o SQL/render de cada card, mesmo com o
`<details>` fechado — sem nenhum teto. Um primeiro log de boot com milhares de
linhas gerava milhares de nós DOM numa única passada de render.

Correção: a lista de requisições (`cappedGroups`) e o "Raw limpo"
(`cappedRawLines`) agora renderizam só uma janela das entradas mais recentes
(150 requisições / 1500 linhas, `REQUEST_LIST_PAGE_SIZE` /
`RAW_LINE_PAGE_SIZE`), com um botão "Carregar mais antigas" que amplia a
janela sob demanda. Como efeito colateral do próprio layout novo, a visão de
requisições já ficou mais leve por natureza: só o dossiê da requisição
**selecionada** renderiza SQL/parâmetros/renderização — as demais linhas da
lista mostram só método/status/rota/duração.

### Remoções

O redesenho trocou a estrutura de cards (`.rails-request-card`,
`.rails-sql-lines`, `.rails-request-details` com `<details>` aninhados) por um
inspetor lista+detalhe — o que deixou órfãos três "enhancers" de DOM que só
existiam para decorar aquela estrutura antiga por fora do Vue:

- `sql-explanation-enhancer.ts`/`.css` e `sql-explanation/render.ts` +
  `sql-explanation/constants.ts` — a *lógica* de explicação
  (`sql-explanation/describe.ts`) foi preservada e passou a ser chamada
  direto do componente; só o encanamento de DOM (MutationObserver +
  `buildExplanation` construindo `HTMLElement`) foi removido.
  `extractStatement` (única função de `extract.ts` que lia `HTMLElement`)
  saiu por não ter mais chamador;
- `log-visual/sql.ts` (`decorateSqlLine`) e `log-visual/render-line.ts`
  (`decorateRenderLine`) — decoravam `.rails-sql-lines code.rails-detail-sql`
  e `.rails-request-details details:nth-of-type(2) .rails-detail-lines code`,
  que não existem mais em lugar nenhum;
- o laço de `.rails-request-details details` (marcar summaries longas) dentro
  de `log-visual-enhancer.ts`.

`log-visual/rails-cards.ts` (`decorateRailsCards`) **ficou**: além de
`.rails-request-card` (agora sem alvo, inofensivo), ele também realça termo de
busca em `.rails-system-group code`, classe que o inspetor novo reaproveita
para mostrar chatter de sistema no dossiê. O mesmo vale para
`log-visual/line-decorators.ts` (`decorateRawLine`) — continua decorando
`.project-log-raw-lines .project-log-line` no "Raw limpo" exatamente como
antes, sem relação com os cards removidos.

## Arquivos principais

- `apps/web/src/components/ProjectLogsPanel.vue`
- `apps/web/src/components/ProjectLogsPanel.css`
- `apps/web/src/components/RailsParamsTree.vue`
- `apps/web/src/utils/ruby-inspect-parser.ts`
- `apps/web/src/utils/sql-highlight.ts`
- `apps/web/src/composables/useProjectLogsPolling.ts`
- `apps/web/src/sql-explanation/describe.ts` (reaproveitado, sem alteração de
  comportamento)

## Testes

- `apps/web/test/ruby-inspect-parser.test.ts` — hash simples, aninhamento,
  arrays/números/booleanos/nulo, wrapper `ActionController::Parameters`,
  entrada inválida;
- `apps/web/test/sql-highlight.test.ts` — tokens de highlight (keyword,
  identificador, placeholder), escape de HTML, agrupamento com detecção de
  N+1;
- `apps/web/test/project-logs-panel.test.ts` — montagem do componente com
  `fetch` mockado: requisição mais recente selecionada por padrão e no topo da
  lista, N+1 + syntax highlight + árvore de parâmetros no dossiê, troca para
  "Raw limpo" com ordenação por grupo (mais recente primeiro), teto de itens
  renderizados com um log sintético de 200 requisições (sem esse teste
  passaria de 150 nós na lista, sinal de estar de volta ao problema do
  travamento).

## Limitações

- não há verificação visual em navegador real com um servidor Rails de
  verdade — este ambiente não tem `DEV_BASE` com um projeto Rails para gerar
  um processo/log real; a validação foi por teste de montagem com log
  sintético equivalente ao do print original;
- o teto de renderização (150 requisições / 1500 linhas raw) é fixo no código,
  não configurável pela UI;
- `log-visual-enhancer.css` e `log-detail-enhancer.css` ainda têm regras CSS
  associadas às classes removidas (`.rails-request-card`,
  `.rails-sql-lines`, `.rails-request-details details:nth-of-type(2)`) —
  inofensivas (sem seletor correspondente no DOM), mas não foram varridas
  nesta entrega para não arriscar quebrar outras regras dentro dos mesmos
  arquivos; fica como limpeza pontual futura.
