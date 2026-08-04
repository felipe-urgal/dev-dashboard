# Task 080 — IA local com Ollama

## Status

Implementada e aguardando revisão.

## Objetivo

Adicionar um painel de assistência de IA ao editor embutido usando **Ollama
local** como provedor padrão — sem chave de API, sem cobrança por token e sem
enviar código do usuário para um serviço remoto — conforme
`docs/architecture/embedded-ide-ai-design.md`.

## Resultado entregue

- painel lateral **IA** no `ProjectEmbeddedEditor.vue` (botão de alternância no
  cabeçalho), com chat sobre o arquivo atual e a seleção corrente no Monaco;
- ações rápidas (Explicar, Corrigir, Gerar testes, Refatorar) que preenchem a
  mensagem com o trecho selecionado ou, na ausência de seleção, o caminho do
  arquivo ativo — o próprio modelo busca o conteúdo via `read_project_file`
  quando precisar;
- detecção do Ollama local (`GET /api/tags` + `POST /api/show` por modelo) e
  listagem dos modelos instalados com a capacidade `tools`, sem baixar nada;
- streaming cancelável: a API converte o NDJSON do Ollama em eventos SSE
  tipados (`AiChatStreamEvent`) sobre uma única requisição `POST` com a
  resposta "sequestrada" (`reply.hijack()`), no mesmo padrão já usado por
  `scripts.ts`/`tests.ts` para eventos de execução;
- catálogo fechado de quatro ferramentas somente leitura, todas limitadas ao
  projeto atual: `read_project_file`, `search_project_text`,
  `list_project_files`, `get_git_diff` — reaproveitando integralmente
  `ProjectFileService` e `GitService` já existentes, sem reimplementar
  validação de caminho;
- nenhuma persistência de conversa: o histórico vive só no estado do
  componente Vue e é descartado ao trocar de projeto ou fechar o painel.

## Decisão de segurança principal

O navegador nunca fala diretamente com o Ollama. `AiAssistantService`
(`apps/api/src/services/ai-assistant-service.ts`) intermedeia toda chamada:

- `DEV_DASHBOARD_OLLAMA_URL` (padrão `http://127.0.0.1:11434`) só é aceita se
  resolver para `http:` em um hostname de loopback (`127.0.0.1`, `localhost`,
  `::1`); qualquer outro valor faz o serviço reportar-se como indisponível —
  nunca conecta a um host remoto;
- catálogo fechado de quatro ferramentas somente leitura (ver abaixo), todas
  limitadas ao projeto atual e validadas pelos serviços já existentes
  (`ProjectFileService`, `GitService`) — nenhum caminho absoluto, sem shell;
  uma chamada de ferramenta fora do catálogo encerra a conversa com um evento
  `error` em vez de ser silenciosamente ignorada ou executada;
- limites de mensagens (até 40 por conversa, 8.000 caracteres cada), de
  rodadas de ferramentas por resposta (até 4, evita loop) e de bytes por
  resultado de ferramenta (8.000 caracteres, com truncamento sinalizado);
- nenhum download ou instalação de modelo iniciado pelo dashboard;
- cancelamento: fechar a conexão HTTP (troca de projeto, fechar o painel,
  clicar em Cancelar) aborta o fetch em andamento contra o Ollama via
  `AbortController` ligado ao evento `close` da resposta.

## Decisões que divergiram do plano original

- **Sem `get_symbol_definition`/`get_symbol_references`.** O plano original
  previa essas duas ferramentas reaproveitando o LSP das tasks 078/079, mas as
  sessões de LSP hoje são conduzidas pelo navegador via WebSocket (`attach`) —
  não existe um caminho para a API iniciar uma consulta de símbolo
  server-side sem essa conexão. Adicionar isso exigiria uma arquitetura nova
  de sessão LSP "sem navegador", fora do escopo desta task. O catálogo ficou
  com as quatro ferramentas que já tinham um serviço reutilizável no lado da
  API: `read_project_file`, `search_project_text`, `list_project_files`,
  `get_git_diff`.
- **Sem aplicação de edições propostas pela IA nesta v1.** O plano prometia
  reaproveitar o preview/confirmação de `WorkspaceEdit` (task 077) para
  qualquer alteração sugerida pelo modelo. Isso exigiria definir e validar um
  formato estruturado de edição via tool-calling do Ollama — não confiável de
  forma uniforme entre os modelos pequenos que rodam localmente, e um projeto
  de segurança à parte (mapear a saída do modelo para
  `ProjectWorkspaceEditRequest` sem permitir escrita arbitrária). O painel
  desta task é somente conversa: a IA pode ler, buscar e explicar, mas não
  propõe patches. Fica registrado como próximo incremento natural, não como
  a task 081 (que é sobre completion inline).
- **Transporte por SSE sobre uma única requisição `POST`, não NDJSON cru
  nem um par start+subscribe com run-store.** O padrão já usado por
  `scripts.ts`/`tests.ts` (iniciar uma execução, depois assinar eventos por
  `GET .../events` com `reply.hijack()`) existe para suportar reconexão e
  histórico persistido — exatamente o que esta task exclui explicitamente
  ("nenhuma persistência de conversa"). Por isso o chat usa uma única
  requisição `POST` cuja resposta já é o stream SSE, sem run id nem
  histórico no servidor; `apps/web/src/api/core.ts#followEventStream` foi
  generalizado para aceitar `RequestInit` (método/corpo) em vez de ganhar uma
  função irmã duplicada.
- **`AiCapability` reduzido a `'chat' | 'tools'`.** O plano listava `edit`,
  `inline-completion`, `fill-in-the-middle` e `embeddings`, mas nenhuma delas
  é interpretada por este v1 (edição não é suportada; completion é a task
  081; embeddings está fora de escopo). Expor capacidades que nada no
  dashboard usa violaria a diretriz do projeto de não crescer superfície sem
  necessidade real — a união fica só com o que o painel realmente decide com
  base nela (`tools` habilita o catálogo de ferramentas).

## Arquitetura entregue

### API e transporte

- `GET /api/projects/:projectId/ai/status` — detecção do Ollama e lista de
  modelos com capacidades;
- `POST /api/projects/:projectId/ai/chat` — corpo `{ model, messages }`,
  resposta SSE (`event: message-delta|tool-call|tool-result|done|error`);
- registrado em `app.ts`/`app-context.ts` como `aiAssistantService`, recebendo
  `ProjectFileService` e `GitService` já compartilhados pelo resto da API.

### Contexto enviado ao modelo

O painel nunca envia o projeto inteiro: a mensagem do usuário carrega o
trecho selecionado no Monaco (quando houver) ou o caminho do arquivo ativo, e
o próprio modelo decide se precisa buscar mais contexto via ferramentas.
Diagnósticos LSP e diff Git como contexto automático (itens 4 e 6 do plano
original) ficaram para um incremento futuro — hoje o diff só entra se o
modelo chamar `get_git_diff` explicitamente.

### Painel no editor

- botão **IA** no cabeçalho do `ProjectEmbeddedEditor.vue` alterna um terceiro
  painel no `embedded-ide-shell`;
- `editor.onDidChangeCursorSelection` alimenta `selectedText`, resetado a cada
  troca de arquivo/projeto;
- transcript local (`role: 'user' | 'assistant'`) some ao trocar de projeto —
  sem qualquer persistência.

## Critérios de aceite

- painel de IA funciona apenas com Ollama local detectado; ausência produz
  orientação clara, sem instalar nada — **atendido**;
- nenhuma chamada do navegador atinge o Ollama diretamente — **atendido**
  (sempre via `AiAssistantService`);
- ferramentas do modelo são limitadas ao catálogo fechado e à raiz do
  projeto — **atendido**;
- streaming é cancelável e não deixa requisições penduradas ao trocar de
  projeto ou fechar o painel — **atendido** (`AbortController` + `watch` no
  `projectId`);
- qualquer edição proposta exige preview e confirmação explícita — **não
  aplicável nesta v1**: não há proposta de edição (ver decisões acima);
- nenhuma conversa é persistida por padrão — **atendido**;
- typecheck, build e testes automatizados passam — **atendido**; smoke E2E
  não foi executado neste ambiente (sem Ollama instalado para exercitar o
  caminho ponta a ponta; a suíde Playwright existente não foi rodada nesta
  entrega).

## Testes automatizados

- `apps/api/test/ai-assistant-service.test.ts`: indisponibilidade sem
  instalar nada, listagem de modelos/capacidades, limites de conversa,
  parsing de NDJSON (incluindo a última linha sem `\n` final — bug real
  encontrado e corrigido durante a implementação), execução das quatro
  ferramentas do catálogo (incluindo diff Git real via `git init`), recusa de
  ferramenta fora do catálogo, comportamento com o sinal já abortado;
- `apps/api/test/ai-assistant-routes.test.ts`: status e chat via
  `app.inject`, corpo inválido rejeitado pelo schema, 404 para projeto
  inexistente, 401 sem token;
- `apps/web/test/project-ai-panel.test.ts`: estado indisponível, envio de
  mensagem com streaming de deltas, ação rápida preenchendo o campo com a
  seleção corrente, erro do assistente exibido sem travar o formulário.

## Fora do escopo

- download ou gerenciamento de modelos Ollama pelo dashboard;
- provedores de IA remotos/pagos;
- busca semântica com embeddings (`/api/embed`) — avaliada apenas como fase
  posterior opt-in;
- `get_symbol_definition`/`get_symbol_references` — dependem de uma sessão de
  LSP iniciada pela API sem navegador, ainda não projetada;
- aplicação de edições propostas pela IA (adiada; ver decisões acima);
- completion inline/FIM no editor, planejada para a task 081;
- persistência de histórico de conversa.

## Próxima atividade

Task 081 — Compleção inline (ghost text/FIM) e contexto semântico ampliado,
conforme `docs/tasks/081-inline-completion.md` e
`docs/architecture/embedded-ide-ai-design.md`.
