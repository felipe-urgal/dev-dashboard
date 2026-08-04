# Task 084 — Ferramentas de símbolo para o assistente de IA

## Status

Implementada e aguardando revisão.

## Contexto

A task 080 (`docs/tasks/080-ollama-local-ai.md`) adiou explicitamente
`get_symbol_definition`/`get_symbol_references` do catálogo de ferramentas
do assistente: "as sessões de LSP hoje são conduzidas pelo navegador via
WebSocket (`attach`) — não existe um caminho para a API iniciar uma
consulta de símbolo server-side sem essa conexão." Esta task adiciona
exatamente esse caminho — uma requisição LSP "de uma vez" (one-shot),
disparada pelo próprio servidor, sem depender de um WebSocket do
navegador — e as duas ferramentas de símbolo que o consomem.

## Objetivo

Adicionar duas ferramentas ao catálogo do assistente,
`get_symbol_definition` e `get_symbol_references`, que consultam o LSP já
gerenciado por `ProjectLanguageServerService` para localizar a definição ou
as referências de um símbolo em um arquivo do projeto, sem exigir que o
navegador tenha uma sessão de editor aberta.

## Decisão de arquitetura: sessão de LSP desacoplada do socket

`LanguageServerSession.socket` já era opcional (usado para o período de
graça de 60s antes do encerramento por ociosidade), mas nada no serviço
conseguia produzir uma resposta útil sem um socket conectado: o handler de
`stdout` só encaminhava mensagens traduzidas quando `session.socket`
existia (`if (translated === undefined || !session.socket) continue;`), e
não havia nenhum correlator de requisição/resposta do lado do servidor —
esse conceito só existia no cliente Monaco (`pending` map em
`project-language-server-client.ts`).

Mudanças em `apps/api/src/services/project-language-server-service.ts`:

- `LanguageServerSession` ganha `pending: Map<number, PendingLspRequest>`,
  um correlator de requisição/resposta simétrico ao do cliente;
- o handler de `stdout` agora resolve uma requisição pendente por `id`
  **antes** de decidir se encaminha ao socket — encaminhar ao navegador e
  responder a uma chamada one-shot deixam de ser mutuamente exclusivos;
- IDs de requisições one-shot usam um contador próprio em **inteiros
  negativos** (`nextOneShotRequestId`, decrescente a partir de -1),
  garantindo que nunca colidam com os IDs positivos que o cliente Monaco já
  gera para sua própria sessão de requisição/resposta;
- novo método público `requestSymbolLocations(project, kind, path,
  position, method)`, onde `method` é `'textDocument/definition'` ou
  `'textDocument/references'`:
  1. confere `status()` — se o LSP não é suportado/disponível para esse
     `(projeto, kind)`, retorna `undefined` sem tentar nada;
  2. reaproveita ou inicia uma sessão (mesma lógica de `start()` já usada
     por `attach`, incluindo limite de reinícios e resolução de comando);
  3. lê o conteúdo atual do arquivo via `ProjectFileService.readFile`
     (mesmas garantias de segurança das outras ferramentas: contenção de
     caminho, exclusão de arquivos sensíveis/binários, limite de tamanho);
  4. envia `textDocument/didOpen` e, na sequência, a requisição
     (`textDocument/definition` ou `textDocument/references`) com um ID
     one-shot;
  5. aguarda a resposta correlacionada (timeout de 10s,
     `SYMBOL_REQUEST_TIMEOUT_MS`) e envia `textDocument/didClose` — a
     ferramenta não mantém nenhum documento "aberto" entre chamadas, ao
     contrário do editor;
  6. traduz o(s) `Location`/`LocationLink` da resposta de volta para
     caminho relativo (`serverUriToClientUri` + `relativePathFromSyntheticUri`,
     já existentes) e posição 1-based (`ProjectTextPosition`), retornando
     `ProjectSymbolLocation[]`.

Nenhuma rota HTTP nova foi criada — a única forma de chegar a
`requestSymbolLocations` é através do executor de ferramentas do
assistente de IA, nunca diretamente do navegador.

## Contratos adicionados

`packages/contracts/src/language-server.ts`:

```ts
export interface ProjectSymbolLocation {
  path: string;
  range: ProjectTextRange;
}
```

`packages/contracts/src/ai-assistant.ts`:

```ts
export type AiTool =
  | 'read_project_file'
  | 'search_project_text'
  | 'list_project_files'
  | 'get_git_diff'
  | 'propose_workspace_edit'
  | 'get_symbol_definition'
  | 'get_symbol_references';
```

## Ferramentas do assistente

Duas novas entradas em `TOOL_DEFINITIONS`
(`apps/api/src/services/ai-assistant-service.ts`), recebendo `path`, `line`
e `column` (1-based, mesmo formato de `ProjectTextPosition` já usado por
`propose_workspace_edit`). `executeTool` despacha para
`this.projectLanguageServerService.requestSymbolLocations(...)`,
escolhendo o `kind` (`ruby` ou `javascript-typescript`) a partir da
extensão do arquivo (`kindForPath`, nova função utilitária). Se o LSP não
estiver disponível para aquele projeto/arquivo, ou a busca não encontrar
nada, a ferramenta retorna um resultado textual claro (`{ available:
false, message }` ou `{ locations: [] }`) em vez de erro — os quatro
tools já existentes seguem o mesmo padrão de degradação graciosa.

`AiAssistantService` passa a receber `ProjectLanguageServerService` como
quinto parâmetro do construtor (com um valor padrão para os testes de
unidade que não o exercitam), e `app-context.ts` conecta a mesma instância
usada pela rota HTTP do gateway LSP — mesmo padrão já usado para
`ProjectWorkspaceEditService` na task 083, para não duplicar estado (aqui,
o mapa de sessões ativas por projeto/kind).

## Segurança

- nenhuma rota nova é criada; a única forma de acionar uma sessão de LSP
  "sem navegador" é através do catálogo fechado de ferramentas de IA;
- leitura de arquivo para `didOpen` passa pelas mesmas guardas de
  `ProjectFileService` (contenção de caminho, exclusão de sensíveis/binários,
  limite de tamanho) que todas as outras ferramentas já usam;
- a sessão de LSP criada por uma chamada one-shot é a **mesma** sessão que
  o navegador usaria (mesmo processo, mesmo limite de reinícios) — não é
  um segundo processo nem um segundo caminho de spawn;
- IDs de requisição one-shot nunca colidem com os do navegador (negativos
  vs. positivos), então uma resposta nunca é entregue ao consumidor errado;
- catálogo de ferramentas do assistente cresce para sete entradas, todas
  hardcoded; as duas novas continuam somente leitura (nenhuma delas
  escreve ou executa comandos).

## Critérios de aceite

- o assistente consegue perguntar "onde é definido/onde é usado este
  símbolo" e receber caminho(s) + posição(ões) — **atendido**;
- uma chamada one-shot não interfere numa sessão de editor já aberta no
  navegador para o mesmo projeto/kind (mensagens continuam sendo
  encaminhadas ao socket normalmente) — **atendido**;
- projeto sem LSP suportado/disponível retorna uma mensagem clara, sem
  tentar spawnar nada — **atendido**;
- nenhuma rota HTTP nova — **atendido**;
- typecheck, build e testes automatizados passam — **atendido**.

## Fora do escopo

- outras capacidades de LSP como ferramenta de IA (outline, rename,
  code actions, hover) — só definição/referências foram pedidas;
- cache de resultados de símbolo entre chamadas;
- exibir os resultados de símbolo na UI do editor fora do painel de chat
  (o editor já tem seu próprio provedor de definição/referências via
  `ProjectLanguageServerClient`, inalterado por esta task).

## Testes automatizados

- `apps/api/test/project-language-server-service.test.ts`: nova cobertura
  do correlator de requisição/resposta one-shot (IDs negativos, timeout,
  didOpen/didClose, não interferência com um socket de navegador
  simultâneo).
- `apps/api/test/ai-assistant-service.test.ts`: as duas novas ferramentas,
  incluindo o caso de LSP indisponível.
