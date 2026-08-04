# Task 091 — Documentação da API gerada a partir dos JSON Schemas

## Status

Concluída.

## Contexto

Executada como frente paralela do inventário de `docs/PENDENCIAS.md`, seção "Qualidade e
manutenção": "Gerar ou verificar a documentação da API a partir dos JSON Schemas e das rotas
Fastify registradas." Não toca em `apps/web`, `packages/core`, nem em nenhuma rota existente —
outras duas frentes paralelas (task 092 — adaptador de navegador; task 093 — changelog) e a
conclusão da task 089 (projetos recentes) rodavam ao mesmo tempo em worktrees separados, sem
disputar arquivos com esta.

## Objetivo

`apps/api/src/routes/*.ts` já declara `schema: { params, body, querystring, response }` como JSON
Schema inline em cada rota Fastify, e schemas de resposta compartilhados vivem em
`apps/api/src/http/response-schemas.ts`. Não havia nenhuma documentação de referência dessa API —
só o checklist de segurança em `docs/architecture/security.md`. Gerar essa referência sem
reescrever manualmente o que já está no código-fonte, para que nunca divirja da API real.

## Decisão principal

A forma mais confiável de extrair os schemas reais seria introspectar a instância Fastify já
montada por `buildApp()` (`apps/api/src/app.ts`). Na prática isso não funcionou de forma
confiável: `Fastify` (avvio) inicia o boot da fila de plugins de forma antecipada assim que o
primeiro `await app.register(...)` é aguardado (o `await app.register(websocket, ...)` logo no
início de `buildApp`), então por volta do momento em que `buildApp()` resolve a Promise, todas as
rotas já foram registradas — um hook `onRoute` adicionado depois de `await buildApp(...)` nunca
dispara (confirmado experimentalmente: `app.hasRoute(...)` já retorna `true` antes de qualquer
hook ser anexado). Monkey-patch do módulo `fastify` via `require.cache` também não funcionou,
porque o loader do `tsx` (usado para carregar `.ts` sem build) não compartilha o cache CJS padrão
do Node com o `createRequire` do script.

A solução adotada evita depender do avvio/boot do Fastify: `scripts/generate-api-docs.mjs` lê
`apps/api/src/app.ts` para descobrir, na ordem real de registro, todo import
`from './routes/algo.js'` (cada um é um plugin de rota real). Para cada plugin, o script importa o
arquivo `.ts` diretamente (via `tsx`) e o executa contra uma instância **stub** mínima que só
implementa `app.get/post/put/patch/delete/head/options(url, opts, handler)` e registra
`{ method, url, schema }` — sem subir servidor, sem abrir porta, sem tocar em rede. As funções de
plugin (`FastifyPluginAsync`) recebem `options` como um `Proxy` que devolve a si mesmo para
qualquer propriedade acessada ou chamada, o que é seguro porque os arquivos de rota só acessam
`options.*` dentro dos corpos dos handlers assíncronos — nunca no escopo de nível superior do
plugin (verificado via grep antes de implementar) — então esses acessos nunca são de fato
executados pelo stub, que nunca invoca handlers.

Isso garante que os JSON Schemas exibidos são exatamente os objetos reais definidos no código,
incluindo os schemas de erro compartilhados via spread (ex.
`...commonErrorResponseSchemas`), já resolvidos como JSON puro no momento da captura — não uma
cópia mantida à mão.

## Escopo

- `scripts/generate-api-docs.mjs` (novo): descobre os plugins de rota via regex sobre
  `apps/api/src/app.ts`, executa cada um contra o stub de Fastify, e renderiza
  `docs/architecture/api-reference.md` agrupado por arquivo de rota (`## Workspaces`,
  `## Git Sync`, etc.), com uma seção `### METHOD /api/caminho` por rota contendo `params`,
  `querystring`, `body` e `response` como blocos JSON. Respostas de erro que batem
  estruturalmente com o formato padrão de `ApiError` (`{ error, message, details? }`) são
  resumidas como "erro padrão da API" com link para a seção "Erros comuns" em vez de repetir o
  mesmo JSON dezenas de vezes;
- `--check`: recalcula o Markdown em memória e compara byte a byte com o arquivo commitado,
  saindo com código 1 se divergir (sem escrever nada em disco);
- `docs/architecture/api-reference.md` (novo, gerado): 137 rotas documentadas nesta revisão,
  agrupadas em 30 seções (uma por arquivo de `apps/api/src/routes/`);
- `package.json` (raiz): scripts `docs:api` (gera) e `docs:api:check` (verifica), cada um com um
  `predocs:api`/`predocs:api:check` que roda `build:packages` primeiro — necessário porque alguns
  arquivos de rota importam valores em runtime de `@dev-dashboard/core`/`@dev-dashboard/project-discovery`
  (ex. `WorkspaceRepositoryError`, `scanWorkspace`), não só tipos, então precisam do `dist/`
  atualizado desses pacotes;
- `.github/workflows/ci.yml`: novo passo "Verifica docs/architecture/api-reference.md" rodando
  `npm run docs:api:check` entre `Build` e `Test` — trivial de ligar já que `build:packages` já
  roda antes nesse mesmo job, então não adiciona custo relevante de CI.

Fora do escopo (conforme instrução): nenhuma rota, nenhum contrato de `packages/contracts`, e
nada em `apps/web` foi alterado.

## Critérios de aceite

- `npm run docs:api` gera `docs/architecture/api-reference.md` cobrindo todas as rotas
  registradas em `apps/api/src/app.ts`, sem exigir edição manual de nenhum schema;
- `npm run docs:api:check` sai com código 0 quando o arquivo commitado está em dia, e com código
  1 (mensagem em português apontando o comando de correção) quando o schema de qualquer rota é
  alterado sem regenerar a doc — testado manualmente alterando um `required` de
  `apps/api/src/routes/health.ts` e revertendo;
- o script não inicia o servidor HTTP de verdade (nenhuma porta aberta, nenhuma dependência de
  `LocalTokenStore`/filesystem do usuário real além da leitura dos próprios arquivos-fonte);
- `npm run typecheck` e `npm run build` continuam passando sem alterações em `apps/`/`packages/`.

## Testes e verificação

- `node --import=tsx scripts/generate-api-docs.mjs` — gera o arquivo, 137 rotas;
- `node --import=tsx scripts/generate-api-docs.mjs --check` — passa com o arquivo em dia;
- teste manual de regressão: editar `apps/api/src/routes/health.ts` (renomear uma propriedade
  `required`), rodar `--check` (falha com exit 1), reverter, rodar `--check` de novo (passa) —
  confirma que o modo `--check` detecta divergência real;
- `npm run typecheck` — passa em todos os workspaces;
- `npm run build` — passa (`build:packages` + `apps/api` + `apps/web`).

Não há teste automatizado de `node --test` dedicado a este script porque ele não expõe nenhuma
função pura reutilizável em runtime da API — é uma ferramenta de geração de documentação que roda
sob demanda/CI, coberta pelo próprio `--check` no pipeline. Se um bug de introspecção passar
despercebido, o próximo `docs:api:check` no CI (ou a próxima alteração de rota que devesse mudar a
doc e não muda) já teria pego, mas o comportamento do gerador em si não tem regressão automatizada
além do teste manual acima.

## Limitações

- o script descobre os plugins de rota fazendo *regex* sobre os `import { xxxRoutes } from
  './routes/algo.js'` de `apps/api/src/app.ts`, não uma análise de AST completa — um import com
  formatação muito fora do padrão atual (ex. múltiplos nomes na mesma chave `{ }`, ou um alias via
  `as`) não seria capturado. Isso é aceitável porque o formato de import de `app.ts` é uniforme
  hoje (uma linha, um nome, sem alias) e o próprio `--check` do CI pegaria a divergência resultante
  na próxima vez que alguém adicionar uma rota nesse formato;
- o stub de Fastify assume que nenhum arquivo de rota registra sub-plugins aninhados com prefixo
  próprio (`app.register(subPlugin, { prefix: '/algo' })`) — verificado hoje via grep (nenhuma
  ocorrência) e documentado no próprio script; se isso mudar no futuro sem que o stub seja
  ajustado, o schema ainda seria capturado, mas o path exibido na doc ficaria sem o prefixo
  aninhado (só o `/api` global seria aplicado);
- rotas sem schema declarado no `response` mas que usam `{ websocket: true }` (ex. `GET
  /api/projects/:projectId/language-server/:kind`) aparecem na doc com a nota "Rota sem schema
  declarado (ex. upgrade de WebSocket)" em vez de uma descrição do protocolo de mensagens —
  correto, porque o protocolo do WebSocket não é expresso como JSON Schema de rota HTTP;
- o arquivo gerado tem ~14 500 linhas (137 rotas × params/querystring/body/response em JSON
  completo) — verboso, mas deliberado: preferimos um dump fiel e sempre sincronizado a um resumo
  compacto que precisaria de manutenção manual e divergiria com o tempo.

## Arquivos alterados

- `scripts/generate-api-docs.mjs` (novo)
- `docs/architecture/api-reference.md` (novo, gerado)
- `package.json` (raiz)
- `.github/workflows/ci.yml`
- `docs/PENDENCIAS.md`
- `docs/tasks/PARALLEL-WORK.md`
- `docs/tasks/README.md`
- `docs/tasks/091-api-docs-generator.md` (este arquivo)
